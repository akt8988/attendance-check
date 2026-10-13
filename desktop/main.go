package main

import (
	"os"
)

func main() {
	if err := run(); err != nil {
		showError("出欠管理", err.Error())
		os.Exit(1)
	}
}
