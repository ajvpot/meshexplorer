package ingestcommon

import (
	"testing"
	"time"
)

func TestIsStale(t *testing.T) {
	d := NewDaemon(&Config{}, nil)
	d.staleAfter = 5 * time.Minute
	const url = "wss://broker.example:443"

	// A broker we have never heard from is not considered stale: there is no
	// activity baseline yet, and connectToBroker seeds one on a successful connect.
	if d.isStale(url) {
		t.Fatalf("broker with no recorded activity should not be stale")
	}

	// Fresh activity -> healthy.
	d.recordActivity(url)
	if d.isStale(url) {
		t.Fatalf("broker with recent activity should not be stale")
	}

	// Activity older than the staleness window -> zombie.
	d.mu.Lock()
	d.lastActivity[url] = time.Now().Add(-10 * time.Minute)
	d.mu.Unlock()
	if !d.isStale(url) {
		t.Fatalf("broker silent for longer than staleAfter should be stale")
	}

	// recordActivity clears staleness again.
	d.recordActivity(url)
	if d.isStale(url) {
		t.Fatalf("recordActivity should reset the staleness clock")
	}
}

func TestNewDaemonStaleAfterDefault(t *testing.T) {
	d := NewDaemon(&Config{}, nil)
	if d.staleAfter != 300*time.Second {
		t.Fatalf("expected default staleAfter of 300s, got %s", d.staleAfter)
	}
	if d.lastActivity == nil {
		t.Fatalf("lastActivity map should be initialized")
	}
}

func TestNewDaemonStaleAfterFromEnv(t *testing.T) {
	t.Setenv("MQTT_STALE_AFTER_SECONDS", "42")
	d := NewDaemon(&Config{}, nil)
	if d.staleAfter != 42*time.Second {
		t.Fatalf("expected staleAfter of 42s from env, got %s", d.staleAfter)
	}
}

func TestSetBrokerStatus(t *testing.T) {
	d := NewDaemon(&Config{}, nil)
	d.setBrokerStatus("a", true)
	d.setBrokerStatus("b", false)
	if !d.BrokerStatus["a"] || d.BrokerStatus["b"] {
		t.Fatalf("setBrokerStatus did not record expected values: %#v", d.BrokerStatus)
	}
}
