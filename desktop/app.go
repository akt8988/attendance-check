package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	maxBody     = 8 * 1024 * 1024
	emptyJSON   = "{\n  \"version\": 1,\n  \"courses\": []\n}\n"
	dataRelPath = "data/attendance-data.json"
)

type app struct {
	dataFile string
	mu       sync.Mutex
}

func exeDir() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	resolved, err := filepath.EvalSymlinks(exe)
	if err != nil {
		resolved = exe
	}
	return filepath.Dir(resolved), nil
}

func newApp() (*app, error) {
	dir, err := exeDir()
	if err != nil {
		return nil, err
	}
	a := &app{dataFile: filepath.Join(dir, filepath.FromSlash(dataRelPath))}
	if err := a.ensureDataFile(); err != nil {
		return nil, err
	}
	return a, nil
}

func (a *app) ensureDataFile() error {
	if err := os.MkdirAll(filepath.Dir(a.dataFile), 0o755); err != nil {
		return err
	}
	if _, err := os.Stat(a.dataFile); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return os.WriteFile(a.dataFile, []byte(emptyJSON), 0o600)
}

func (a *app) handler(web fs.FS) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/data", a.handleData)
	mux.Handle("/", withNoStore(http.FileServer(http.FS(web))))
	return withLocalHostOnly(mux)
}

// withLocalHostOnly rejects requests whose Host header is not this machine.
// Guards against DNS-rebinding: a malicious website must not be able to read
// or overwrite the attendance data while the app window is open.
func withLocalHostOnly(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if i := strings.LastIndex(host, ":"); i >= 0 {
			host = host[:i]
		}
		host = strings.Trim(host, "[]")
		switch host {
		case "127.0.0.1", "localhost", "::1":
			h.ServeHTTP(w, r)
		default:
			http.Error(w, "forbidden", http.StatusForbidden)
		}
	})
}

func withNoStore(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		h.ServeHTTP(w, r)
	})
}

func (a *app) handleData(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	switch r.Method {
	case http.MethodGet:
		a.handleGet(w)
	case http.MethodPut:
		a.handlePut(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *app) handleGet(w http.ResponseWriter) {
	a.mu.Lock()
	defer a.mu.Unlock()
	body, err := os.ReadFile(a.dataFile)
	if err != nil {
		http.Error(w, "read failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(body)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (a *app) handlePut(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "payload too large", http.StatusRequestEntityTooLarge)
		return
	}
	if !validPayload(raw) {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	if err := atomicWrite(a.dataFile, raw); err != nil {
		http.Error(w, "write failed", http.StatusInternalServerError)
		return
	}
	body := []byte(`{"ok":true}`)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(body)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func validPayload(raw []byte) bool {
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(raw, &payload); err != nil {
		return false
	}
	courses, ok := payload["courses"]
	if !ok {
		return false
	}
	var list []json.RawMessage
	return json.Unmarshal(courses, &list) == nil
}

func atomicWrite(path string, body []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, body, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(path)
		if err2 := os.Rename(tmp, path); err2 != nil {
			_ = os.Remove(tmp)
			return err2
		}
	}
	return nil
}

func startServer(h http.Handler) (*http.Server, string, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, "", err
	}
	srv := &http.Server{
		Handler:           h,
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		_ = srv.Serve(ln)
	}()
	url := "http://" + ln.Addr().String() + "/"
	return srv, url, nil
}
