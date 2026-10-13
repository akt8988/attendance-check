//go:build windows

package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/jchv/go-webview2"
)

func run() error {
	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		return fmt.Errorf("アプリ画面の読み込みに失敗しました。")
	}
	if _, err := fs.Stat(sub, "index.html"); err != nil {
		return fmt.Errorf("アプリ画面が見つかりません。desktop/build.sh で exe を作り直してください。")
	}

	a, err := newApp()
	if err != nil {
		return fmt.Errorf("保存ファイルを準備できませんでした。\n%s", err.Error())
	}

	srv, url, err := startServer(a.handler(sub))
	if err != nil {
		return fmt.Errorf("起動に失敗しました。\n%s", err.Error())
	}
	defer func() { _ = srv.Close() }()

	dataPath := webviewDataPath()
	if err := os.MkdirAll(dataPath, 0o755); err != nil {
		return fmt.Errorf("作業フォルダを作れませんでした。\n%s", err.Error())
	}

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		DataPath:  dataPath,
		AutoFocus: true,
		WindowOptions: webview2.WindowOptions{
			Title:  "出欠管理",
			Width:  1280,
			Height: 800,
			Center: true,
		},
	})
	if w == nil {
		return fmt.Errorf("Microsoft Edge WebView2 が必要です。\nWindows の「WebView2 Runtime」をインストールするか、Microsoft Edge が入った PC で開いてください。\nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703")
	}
	defer w.Destroy()

	w.Navigate(url)
	w.Run()
	return nil
}

func webviewDataPath() string {
	if base := os.Getenv("LOCALAPPDATA"); base != "" {
		return filepath.Join(base, "AttendanceCheck", "WebView2")
	}
	dir, err := exeDir()
	if err != nil {
		return "AttendanceCheck-WebView2"
	}
	return filepath.Join(dir, "webview2-data")
}
