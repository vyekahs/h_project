use std::collections::HashMap;
use std::time::{Duration, Instant};

use crate::irk;

/// A registered BLE device with pre-computed IRK bytes
pub struct IrkEntry {
    pub attendee_id: u32,
    pub irk_hex: String,
    pub irk_bytes: [u8; 16],
    pub irk_bytes_rev: [u8; 16],
}

/// IRK store — loaded from SvelteKit on startup, updated via /irk/add and /irk/remove
pub struct IrkStore {
    entries: Vec<IrkEntry>,
}

impl IrkStore {
    pub fn new() -> Self {
        Self { entries: Vec::new() }
    }

    pub fn load(&mut self, devices: Vec<(u32, String)>) {
        self.entries.clear();
        for (attendee_id, irk_hex) in devices {
            if let Some(entry) = Self::make_entry(attendee_id, &irk_hex) {
                self.entries.push(entry);
            }
        }
        tracing::info!("IRK store loaded: {} devices", self.entries.len());
    }

    pub fn add(&mut self, attendee_id: u32, irk_hex: &str) {
        // Remove existing entry for same IRK
        self.entries.retain(|e| e.irk_hex != irk_hex);
        if let Some(entry) = Self::make_entry(attendee_id, irk_hex) {
            self.entries.push(entry);
            tracing::info!("IRK added: attendee_id={}, total={}", attendee_id, self.entries.len());
        }
    }

    pub fn remove(&mut self, attendee_id: Option<u32>, irk_hex: Option<&str>) {
        let before = self.entries.len();
        self.entries.retain(|e| {
            if let Some(irk) = irk_hex {
                if e.irk_hex == irk {
                    return false;
                }
            }
            if let Some(id) = attendee_id {
                if irk_hex.is_none() && e.attendee_id == id {
                    return false;
                }
            }
            true
        });
        tracing::info!("IRK removed: {} entries removed, total={}", before - self.entries.len(), self.entries.len());
    }

    pub fn entries(&self) -> &[IrkEntry] {
        &self.entries
    }

    fn make_entry(attendee_id: u32, irk_hex: &str) -> Option<IrkEntry> {
        let (irk_bytes, irk_bytes_rev) = irk::parse_irk(irk_hex)?;
        Some(IrkEntry {
            attendee_id,
            irk_hex: irk_hex.to_string(),
            irk_bytes,
            irk_bytes_rev,
        })
    }
}

/// RPA cache: MAC -> (attendee_id, expires_at)
struct RpaCacheEntry {
    attendee_id: u32,
    expires_at: Instant,
}

pub struct RpaCache {
    entries: HashMap<String, RpaCacheEntry>,
    ttl: Duration,
}

impl RpaCache {
    pub fn new(ttl_secs: u64) -> Self {
        Self {
            entries: HashMap::new(),
            ttl: Duration::from_secs(ttl_secs),
        }
    }

    /// Check cache for a MAC. Returns attendee_id if found and not expired.
    /// Refreshes TTL on hit.
    pub fn get(&mut self, mac: &str) -> Option<u32> {
        let now = Instant::now();
        if let Some(entry) = self.entries.get_mut(mac) {
            if now < entry.expires_at {
                entry.expires_at = now + self.ttl; // refresh TTL
                return Some(entry.attendee_id);
            } else {
                self.entries.remove(mac);
            }
        }
        None
    }

    pub fn insert(&mut self, mac: String, attendee_id: u32) {
        self.entries.insert(mac, RpaCacheEntry {
            attendee_id,
            expires_at: Instant::now() + self.ttl,
        });
    }

    pub fn cleanup(&mut self) {
        let now = Instant::now();
        self.entries.retain(|_, v| v.expires_at > now);
    }
}

/// Negative cache: MACs that didn't match any IRK
pub struct NegativeCache {
    entries: HashMap<String, Instant>,
    ttl: Duration,
}

impl NegativeCache {
    pub fn new(ttl_secs: u64) -> Self {
        Self {
            entries: HashMap::new(),
            ttl: Duration::from_secs(ttl_secs),
        }
    }

    pub fn contains(&self, mac: &str) -> bool {
        if let Some(&expires_at) = self.entries.get(mac) {
            Instant::now() < expires_at
        } else {
            false
        }
    }

    pub fn insert(&mut self, mac: String) {
        self.entries.insert(mac, Instant::now() + self.ttl);
    }

    pub fn cleanup(&mut self) {
        let now = Instant::now();
        self.entries.retain(|_, &mut exp| exp > now);
    }
}
