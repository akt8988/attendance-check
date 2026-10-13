//go:build !windows

package main

import "fmt"

func run() error {
	return fmt.Errorf("このアプリの専用ウィンドウ版は Windows 用です。desktop/build.sh で AttendanceCheck.exe を作成してください。")
}
