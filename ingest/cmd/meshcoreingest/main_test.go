package main

import (
	"encoding/hex"
	"strings"
	"testing"
	"time"
)

func TestParseMeshCoreRawMessage_Valid(t *testing.T) {
	payload := []byte(`{
		"origin": "WW7STR/PugetMesh Cougar^",
		"origin_id": "CB1F3E60913AC96ECCD9AE1053BB8646C5AA0A8EDBAC6D17822D06B0E054F6A5",
		"timestamp": "2025-07-02T00:13:53.335723",
		"type": "RAW",
		"data": "050258C454C59A5A6A081C07D97E4A4C22FE575584F2BCE8267D76E0AAAC55283350EDCE7AF4ECBDCF12C599017ACC03D659F6C2A2AEF684B66774501A77BD4F361C6E5436BB6625"
	}`)
	origin, originPubkey, meshTimestamp, packet, err := parseMeshCoreRawMessage(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if origin != "WW7STR/PugetMesh Cougar^" {
		t.Errorf("unexpected origin: %s", origin)
	}
	if hex.EncodeToString(originPubkey) != strings.ToLower("CB1F3E60913AC96ECCD9AE1053BB8646C5AA0A8EDBAC6D17822D06B0E054F6A5") {
		t.Errorf("unexpected origin_pubkey: %s", hex.EncodeToString(originPubkey))
	}
	if meshTimestamp.Format(time.RFC3339Nano) != "2025-07-02T00:13:53.335723Z" {
		t.Errorf("unexpected meshTimestamp: %s", meshTimestamp)
	}
	if len(packet) == 0 {
		t.Error("packet should not be empty")
	}
}

func TestParseMeshCoreRawMessage_InvalidHex(t *testing.T) {
	payload := []byte(`{
		"origin": "WW7STR/PugetMesh Cougar^",
		"origin_id": "CB1F3E60913AC96ECCD9AE1053BB8646C5AA0A8EDBAC6D17822D06B0E054F6A5",
		"timestamp": "2025-07-02T00:13:53.335723",
		"type": "RAW",
		"data": "nothex"
	}`)
	_, _, _, _, err := parseMeshCoreRawMessage(payload)
	if err == nil {
		t.Error("expected error for invalid hex")
	}
}

func TestParseMeshCoreRawMessage_InvalidTimestamp(t *testing.T) {
	payload := []byte(`{
		"origin": "WW7STR/PugetMesh Cougar^",
		"origin_id": "CB1F3E60913AC96ECCD9AE1053BB8646C5AA0A8EDBAC6D17822D06B0E054F6A5",
		"timestamp": "notatime",
		"type": "RAW",
		"data": "050258C454C59A5A6A081C07D97E4A4C22FE575584F2BCE8267D76E0AAAC55283350EDCE7AF4ECBDCF12C599017ACC03D659F6C2A2AEF684B66774501A77BD4F361C6E5436BB6625"
	}`)
	_, _, _, _, err := parseMeshCoreRawMessage(payload)
	if err == nil {
		t.Error("expected error for invalid timestamp")
	}
}

func TestParseMeshCoreRawMessage_InvalidJSON(t *testing.T) {
	payload := []byte(`notjson`)
	_, _, _, _, err := parseMeshCoreRawMessage(payload)
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestParseMeshCoreRawMessage_WithOriginID(t *testing.T) {
	payload := []byte(`{
		"origin": "HAX!peater^",
		"origin_id": "CB1F3E60913AC96ECCD9AE1053BB8646C5AA0A8EDBAC6D17822D06B0E054F6A5",
		"timestamp": "2025-08-18T17:27:28.053612",
		"type": "RAW",
		"data": "0500857E3083FDA8C09D70B84A77460B03F3408A1C24B478BA397BB9563CDDB09FE48CB9F0B04BEE7976EAD62B894E5FE91D9F000FC4B6437F46AB94CC6FE0936A97675698D9"
	}`)
	origin, originPubkey, meshTimestamp, packet, err := parseMeshCoreRawMessage(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if origin != "HAX!peater^" {
		t.Errorf("unexpected origin: %s", origin)
	}
	if hex.EncodeToString(originPubkey) != strings.ToLower("CB1F3E60913AC96ECCD9AE1053BB8646C5AA0A8EDBAC6D17822D06B0E054F6A5") {
		t.Errorf("unexpected origin_pubkey: %s", hex.EncodeToString(originPubkey))
	}
	if meshTimestamp.Format(time.RFC3339Nano) != "2025-08-18T17:27:28.053612Z" {
		t.Errorf("unexpected meshTimestamp: %s", meshTimestamp)
	}
	if len(packet) == 0 {
		t.Error("packet should not be empty")
	}
}

func TestExtractBaseTopic(t *testing.T) {
	tests := []struct {
		name     string
		topic    string
		expected string
	}{
		// Raw topic cases
		{
			name:     "meshcore/raw",
			topic:    "meshcore/raw",
			expected: "meshcore",
		},
		{
			name:     "meshcore/salish/raw",
			topic:    "meshcore/salish/raw",
			expected: "meshcore/salish",
		},
		{
			name:     "meshcore/salish/a/raw",
			topic:    "meshcore/salish/a/raw",
			expected: "meshcore/salish/a",
		},
		{
			name:     "meshcore/salish/a/b/raw",
			topic:    "meshcore/salish/a/b/raw",
			expected: "meshcore/salish/a/b",
		},
		// Binary topic cases
		{
			name:     "meshcore/binary/gateway123",
			topic:    "meshcore/binary/gateway123",
			expected: "meshcore",
		},
		{
			name:     "meshcore/salish/binary/gateway456",
			topic:    "meshcore/salish/binary/gateway456",
			expected: "meshcore/salish",
		},
		{
			name:     "meshcore/salish/a/binary/gateway789",
			topic:    "meshcore/salish/a/binary/gateway789",
			expected: "meshcore/salish/a",
		},
		// Edge cases
		{
			name:     "single part topic",
			topic:    "meshcore",
			expected: "meshcore",
		},
		{
			name:     "empty topic",
			topic:    "",
			expected: "",
		},
		{
			name:     "topic with only raw",
			topic:    "raw",
			expected: "raw",
		},
		{
			name:     "topic with only binary",
			topic:    "binary",
			expected: "binary",
		},
		// Complex nested cases
		{
			name:     "deep nested raw",
			topic:    "meshcore/region/state/city/neighborhood/raw",
			expected: "meshcore/region/state/city/neighborhood",
		},
		{
			name:     "deep nested binary",
			topic:    "meshcore/region/state/city/neighborhood/binary/gateway999",
			expected: "meshcore/region/state/city/neighborhood",
		},
		// Mixed cases that shouldn't match our patterns
		{
			name:     "topic ending with other than raw or binary",
			topic:    "meshcore/salish/other",
			expected: "meshcore",
		},
		{
			name:     "topic with raw in middle",
			topic:    "meshcore/raw/salish",
			expected: "meshcore",
		},
		{
			name:     "topic with binary in middle",
			topic:    "meshcore/binary/salish",
			expected: "meshcore",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractBaseTopic(tt.topic)
			if result != tt.expected {
				t.Errorf("extractBaseTopic(%q) = %q, want %q", tt.topic, result, tt.expected)
			}
		})
	}
}

func TestExtractGatewayID(t *testing.T) {
	tests := []struct {
		name       string
		topic      string
		expected   string
		shouldHave bool
	}{
		{
			name:       "meshcore/binary/gateway123",
			topic:      "meshcore/binary/gateway123",
			expected:   "gateway123",
			shouldHave: true,
		},
		{
			name:       "meshcore/salish/binary/gateway456",
			topic:      "meshcore/salish/binary/gateway456",
			expected:   "gateway456",
			shouldHave: true,
		},
		{
			name:       "meshcore/salish/a/binary/gateway789",
			topic:      "meshcore/salish/a/binary/gateway789",
			expected:   "gateway789",
			shouldHave: true,
		},
		{
			name:       "deep nested binary",
			topic:      "meshcore/region/state/city/neighborhood/binary/gateway999",
			expected:   "gateway999",
			shouldHave: true,
		},
		{
			name:       "not a binary topic",
			topic:      "meshcore/raw",
			expected:   "",
			shouldHave: false,
		},
		{
			name:       "not a binary topic 2",
			topic:      "meshcore/salish/other",
			expected:   "",
			shouldHave: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			topicParts := strings.Split(tt.topic, "/")
			var gatewayID string

			// Match the exact logic from the main function
			if len(topicParts) >= 3 && topicParts[len(topicParts)-2] == "binary" {
				gatewayID = topicParts[len(topicParts)-1]
			}

			if tt.shouldHave {
				if gatewayID != tt.expected {
					t.Errorf("extractGatewayID(%q) = %q, want %q", tt.topic, gatewayID, tt.expected)
				}
			} else {
				if gatewayID != "" {
					t.Errorf("extractGatewayID(%q) = %q, but should not have gateway ID", tt.topic, gatewayID)
				}
			}
		})
	}
}

// Some gateways encode the numeric metric fields — SNR, RSSI, len, etc. — as
// bare JSON numbers, including negative and fractional values, rather than
// strings. These must parse rather than dropping the whole packet (and the raw
// bytes we need with it).
func TestParseMeshCorePacketsMessage_NumericMetrics(t *testing.T) {
	payload := []byte(`{
		"timestamp": "2026-06-19T07:03:43.000000",
		"origin": "PDX Gateway Bridge 14",
		"origin_id": "FACE69B85A0D184C7D122164BDFADE87F25069455C85DD2824CAD3F6AA0B1929",
		"type": "PACKET", "direction": "rx", "len": 38, "payload_len": 20,
		"packet_type": 1, "route": "F",
		"raw": "05481D6B54CA61006000AEE498916968452A7994F827AFB6CE312721FFBE377BA3D113F924C6",
		"SNR": -9.25, "RSSI": -95, "score": 1000, "duration": 0
	}`)
	origin, originPubkey, meshTimestamp, packet, err := parseMeshCorePacketsMessage(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if origin != "PDX Gateway Bridge 14" {
		t.Errorf("unexpected origin: %s", origin)
	}
	if hex.EncodeToString(originPubkey) != strings.ToLower("FACE69B85A0D184C7D122164BDFADE87F25069455C85DD2824CAD3F6AA0B1929") {
		t.Errorf("unexpected origin_pubkey: %s", hex.EncodeToString(originPubkey))
	}
	if meshTimestamp.Format(time.RFC3339Nano) != "2026-06-19T07:03:43Z" {
		t.Errorf("unexpected meshTimestamp: %s", meshTimestamp)
	}
	if len(packet) == 0 {
		t.Error("packet should not be empty")
	}
}

// The same fields quoted as strings (other gateways) must keep working too.
func TestParseMeshCorePacketsMessage_StringMetrics(t *testing.T) {
	payload := []byte(`{
		"timestamp": "2026-06-19T07:03:43.000000",
		"origin": "PDX Gateway Bridge 14",
		"origin_id": "FACE69B85A0D184C7D122164BDFADE87F25069455C85DD2824CAD3F6AA0B1929",
		"type": "PACKET", "direction": "rx", "len": "38", "payload_len": "20",
		"raw": "05481D6B54CA61006000AEE498916968452A7994F827AFB6CE312721FFBE377BA3D113F924C6",
		"SNR": "11.8", "RSSI": "-38"
	}`)
	_, _, _, packet, err := parseMeshCorePacketsMessage(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(packet) == 0 {
		t.Error("packet should not be empty")
	}
}
