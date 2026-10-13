//go:build windows

package main

import "embed"

// Static app files are copied here by build.sh (index.html, css, js, vendor, icons).
//
//go:embed all:web
var webFS embed.FS
