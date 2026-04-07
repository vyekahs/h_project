mod irk;
mod cache;
mod forward;

use std::sync::Arc;
use axum::{
    Router,
    routing::{get, post},
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

struct AppState {
    irk_store: RwLock<cache::IrkStore>,
    rpa_cache: RwLock<cache::RpaCache>,
    negative_cache: RwLock<cache::NegativeCache>,
    http_client: reqwest::Client,
    config: Config,
}

#[derive(Clone)]
struct Config {
    scanner_api_key: String,
    sveltekit_url: String,
    internal_api_key: String,
}

// --- Request/Response types ---

#[derive(Deserialize)]
struct BleReport {
    scanner_id: Option<String>,
    #[allow(dead_code)]
    timestamp: Option<u64>,
    devices: Vec<ScannedDevice>,
    batch_index: Option<u32>,
    total_batches: Option<u32>,
}

#[derive(Deserialize)]
struct ScannedDevice {
    mac: String,
    #[allow(dead_code)]
    rssi: i32,
    #[allow(dead_code)]
    name: Option<String>,
}

#[derive(Serialize)]
struct BleResponse {
    success: bool,
    count: usize,
}

#[derive(Deserialize)]
struct IrkAddRequest {
    attendee_id: u32,
    irk_hex: String,
}

#[derive(Deserialize)]
struct IrkRemoveRequest {
    attendee_id: Option<u32>,
    irk_hex: Option<String>,
}

// --- Handlers ---

async fn handle_ble_report(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    // 1. Auth
    let api_key = headers
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if api_key != state.config.scanner_api_key {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "Unauthorized"}))).into_response();
    }

    // 2. Parse body (sanitize control characters like the TS code)
    let raw = String::from_utf8_lossy(&body);
    let sanitized: String = raw.chars().filter(|c| !c.is_control() || *c == '\n' || *c == '\r').collect();

    let report: BleReport = match serde_json::from_str(&sanitized) {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("JSON parse error: {}", e);
            return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "Invalid JSON"}))).into_response();
        }
    };

    let scanner_id = report.scanner_id.unwrap_or_else(|| "unknown_scanner".to_string());
    let is_last_batch = report.total_batches.is_none()
        || report.batch_index.map_or(true, |idx| {
            idx == report.total_batches.unwrap() - 1
        });
    let device_count = report.devices.len();

    tracing::info!(
        "[BLE] Report from {}: {} devices (batch {}/{})",
        scanner_id,
        device_count,
        report.batch_index.map_or(1, |i| i + 1),
        report.total_batches.unwrap_or(1),
    );

    // Log first 3 MACs for debugging
    for (i, dev) in report.devices.iter().enumerate().take(3) {
        tracing::info!("[BLE] MAC sample[{}]: {} ({}dBm)", i, dev.mac, dev.rssi);
    }

    // 3. IRK matching
    let mut matched_ids: Vec<u32> = Vec::new();
    let mut matched_set = std::collections::HashSet::new();

    for device in &report.devices {
        let mac = &device.mac;

        // Check RPA cache
        {
            let mut rpa_cache = state.rpa_cache.write().await;
            if let Some(attendee_id) = rpa_cache.get(mac) {
                if matched_set.insert(attendee_id) {
                    matched_ids.push(attendee_id);
                }
                continue;
            }
        }

        // Check negative cache
        {
            let neg_cache = state.negative_cache.read().await;
            if neg_cache.contains(mac) {
                continue;
            }
        }

        // Try IRK matching
        let mut found = false;
        {
            let irk_store = state.irk_store.read().await;
            for entry in irk_store.entries() {
                if irk::resolve_rpa(mac, &entry.irk_bytes, &entry.irk_bytes_rev) {
                    // Cache the match
                    {
                        let mut rpa_cache = state.rpa_cache.write().await;
                        rpa_cache.insert(mac.clone(), entry.attendee_id);
                    }
                    if matched_set.insert(entry.attendee_id) {
                        matched_ids.push(entry.attendee_id);
                        tracing::info!("[BLE] Matched: {} -> User {}", mac, entry.attendee_id);
                    }
                    found = true;
                    break;
                }
            }
        }

        if !found {
            let mut neg_cache = state.negative_cache.write().await;
            neg_cache.insert(mac.clone());
        }
    }

    tracing::info!(
        "[BLE] Match Summary: {} users matched out of {} scanned devices",
        matched_ids.len(),
        device_count,
    );

    // 4. Forward to SvelteKit (fire-and-forget)
    if !matched_ids.is_empty() || is_last_batch {
        let client = state.http_client.clone();
        let base_url = state.config.sveltekit_url.clone();
        let api_key = state.config.internal_api_key.clone();
        let scanner_id_clone = scanner_id.clone();

        tokio::spawn(async move {
            let result = forward::MatchedResult {
                scanner_id: scanner_id_clone,
                matched_attendee_ids: matched_ids,
                is_last_batch,
                source: "BLE".to_string(),
            };
            forward::forward_matched(&client, &base_url, &api_key, &result).await;
        });
    }

    // 5. Respond immediately
    Json(BleResponse { success: true, count: device_count }).into_response()
}

async fn handle_irk_add(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<IrkAddRequest>,
) -> impl IntoResponse {
    if !check_internal_key(&headers, &state.config.internal_api_key) {
        return StatusCode::UNAUTHORIZED;
    }
    let mut store = state.irk_store.write().await;
    store.add(req.attendee_id, &req.irk_hex);
    StatusCode::OK
}

async fn handle_irk_remove(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<IrkRemoveRequest>,
) -> impl IntoResponse {
    if !check_internal_key(&headers, &state.config.internal_api_key) {
        return StatusCode::UNAUTHORIZED;
    }
    let mut store = state.irk_store.write().await;
    store.remove(req.attendee_id, req.irk_hex.as_deref());
    StatusCode::OK
}

async fn handle_health() -> &'static str {
    "OK"
}

fn check_internal_key(headers: &HeaderMap, expected: &str) -> bool {
    headers
        .get("x-internal-key")
        .and_then(|v| v.to_str().ok())
        .map_or(false, |v| v == expected)
}

// --- Startup ---

async fn load_irk_with_retry(state: &AppState) {
    let max_retries = 30;
    for attempt in 1..=max_retries {
        match forward::fetch_irk_list(
            &state.http_client,
            &state.config.sveltekit_url,
            &state.config.internal_api_key,
        )
        .await
        {
            Ok(devices) => {
                let mut store = state.irk_store.write().await;
                store.load(devices);
                return;
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to fetch IRK list (attempt {}/{}): {}",
                    attempt, max_retries, e
                );
                if attempt < max_retries {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            }
        }
    }
    tracing::error!("Could not fetch IRK list after {} attempts. Starting with empty list.", max_retries);
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let config = Config {
        scanner_api_key: std::env::var("SCANNER_API_KEY")
            .unwrap_or_else(|_| "hproject_scanner_secret_2026".to_string()),
        sveltekit_url: std::env::var("SVELTEKIT_URL")
            .unwrap_or_else(|_| "http://app:3000".to_string()),
        internal_api_key: std::env::var("INTERNAL_API_KEY")
            .unwrap_or_else(|_| "ble_internal_secret_2026".to_string()),
    };
    let port: u16 = std::env::var("LISTEN_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);

    let state = Arc::new(AppState {
        irk_store: RwLock::new(cache::IrkStore::new()),
        rpa_cache: RwLock::new(cache::RpaCache::new(30 * 60)), // 30 min
        negative_cache: RwLock::new(cache::NegativeCache::new(30)), // 30s (RPA rotation 후 빠른 재매칭)
        http_client: reqwest::Client::new(),
        config,
    });

    // Load IRKs from SvelteKit
    load_irk_with_retry(&state).await;

    // Background cache cleanup every 60 seconds
    let cleanup_state = Arc::clone(&state);
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            {
                let mut rpa = cleanup_state.rpa_cache.write().await;
                rpa.cleanup();
            }
            {
                let mut neg = cleanup_state.negative_cache.write().await;
                neg.cleanup();
            }
        }
    });

    let app = Router::new()
        .route("/api/ble/report", post(handle_ble_report))
        .route("/irk/add", post(handle_irk_add))
        .route("/irk/remove", post(handle_irk_remove))
        .route("/health", get(handle_health))
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("BLE server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
