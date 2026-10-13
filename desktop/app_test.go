package main

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

func TestValidPayload(t *testing.T) {
	if !validPayload([]byte(`{"version":1,"courses":[]}`)) {
		t.Fatal("empty courses should be valid")
	}
	if !validPayload([]byte(`{"courses":[{"id":"c1"}]}`)) {
		t.Fatal("courses array should be valid")
	}
	if validPayload([]byte(`{"version":1}`)) {
		t.Fatal("missing courses should be invalid")
	}
	if validPayload([]byte(`{"courses":{}}`)) {
		t.Fatal("courses object should be invalid")
	}
	if validPayload([]byte(`not json`)) {
		t.Fatal("invalid json")
	}
}

func TestDataAPI(t *testing.T) {
	dir := t.TempDir()
	a := &app{dataFile: filepath.Join(dir, "attendance-data.json")}
	if err := a.ensureDataFile(); err != nil {
		t.Fatal(err)
	}
	web := fstest.MapFS{"index.html": {Data: []byte("<html>ok</html>")}}
	srv := httptest.NewServer(a.handler(web))
	t.Cleanup(srv.Close)

	res, err := http.Get(srv.URL + "/api/data")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatalf("GET status %d", res.StatusCode)
	}
	if !bytes.Contains(body, []byte(`"courses"`)) {
		t.Fatalf("GET body: %s", body)
	}

	payload := []byte("{\n  \"version\": 1,\n  \"courses\": [{\"id\":\"demo\"}]\n}\n")
	req, err := http.NewRequest(http.MethodPut, srv.URL+"/api/data", bytes.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	res, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatalf("PUT status %d", res.StatusCode)
	}

	saved, err := os.ReadFile(a.dataFile)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(saved), `"demo"`) {
		t.Fatalf("saved file: %s", saved)
	}

	res, err = http.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	page, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 || !bytes.Contains(page, []byte("ok")) {
		t.Fatalf("index status %d body %s", res.StatusCode, page)
	}
}

func TestHostRestriction(t *testing.T) {
	dir := t.TempDir()
	a := &app{dataFile: filepath.Join(dir, "attendance-data.json")}
	if err := a.ensureDataFile(); err != nil {
		t.Fatal(err)
	}
	web := fstest.MapFS{"index.html": {Data: []byte("<html>ok</html>")}}
	srv := httptest.NewServer(a.handler(web))
	t.Cleanup(srv.Close)

	// DNS-rebinding style: a foreign Host must be rejected even on loopback.
	for _, path := range []string{"/api/data", "/"} {
		req, err := http.NewRequest(http.MethodGet, srv.URL+path, nil)
		if err != nil {
			t.Fatal(err)
		}
		req.Host = "evil.example.com"
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusForbidden {
			t.Fatalf("%s: expected 403 for foreign Host, got %d", path, res.StatusCode)
		}
	}
}
