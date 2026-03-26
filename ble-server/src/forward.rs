use serde::Serialize;

#[derive(Serialize)]
pub struct MatchedResult {
    pub scanner_id: String,
    pub matched_attendee_ids: Vec<u32>,
    pub is_last_batch: bool,
    pub source: String,
}

/// Forward matched attendee IDs to SvelteKit internal endpoint
pub async fn forward_matched(
    client: &reqwest::Client,
    base_url: &str,
    internal_api_key: &str,
    result: &MatchedResult,
) {
    let url = format!("{}/api/internal/ble/matched", base_url);

    match client
        .post(&url)
        .header("x-internal-key", internal_api_key)
        .json(result)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
    {
        Ok(resp) => {
            if !resp.status().is_success() {
                tracing::error!(
                    "SvelteKit returned {}: {}",
                    resp.status(),
                    resp.text().await.unwrap_or_default()
                );
            }
        }
        Err(e) => {
            tracing::error!("Failed to forward to SvelteKit: {}", e);
        }
    }
}

/// Fetch IRK list from SvelteKit on startup
pub async fn fetch_irk_list(
    client: &reqwest::Client,
    base_url: &str,
    internal_api_key: &str,
) -> Result<Vec<(u32, String)>, String> {
    let url = format!("{}/api/internal/ble/irk-list", base_url);

    let resp = client
        .get(&url)
        .header("x-internal-key", internal_api_key)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Status {}", resp.status()));
    }

    #[derive(serde::Deserialize)]
    struct IrkListResponse {
        devices: Vec<IrkDevice>,
    }

    #[derive(serde::Deserialize)]
    struct IrkDevice {
        attendee_id: u32,
        irk_hex: String,
    }

    let body: IrkListResponse = resp.json().await.map_err(|e| format!("JSON error: {}", e))?;

    Ok(body.devices.into_iter().map(|d| (d.attendee_id, d.irk_hex)).collect())
}
