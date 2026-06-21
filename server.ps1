$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataFile = Join-Path $root 'data.json'
$listener = New-Object System.Net.HttpListener
$prefix = 'http://localhost:8765/'
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Asset Dashboard server running at $prefix"

$mimeTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'application/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png' = 'image/png'
  '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.svg' = 'image/svg+xml'
}

function Write-JsonResponse($context, $statusCode, $payload) {
  $response = $context.Response
  $response.StatusCode = $statusCode
  $response.ContentType = 'application/json; charset=utf-8'
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  $response.ContentLength64 = $bytes.Length
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.OutputStream.Close()
}

function Write-FileResponse($context, $path) {
  $response = $context.Response
  if (-not (Test-Path $path)) {
    $response.StatusCode = 404
    $response.OutputStream.Close()
    return
  }

  $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
  $response.ContentType = $mimeTypes[$ext]
  if (-not $response.ContentType) {
    $response.ContentType = 'application/octet-stream'
  }

  $bytes = [System.IO.File]::ReadAllBytes($path)
  $response.ContentLength64 = $bytes.Length
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.OutputStream.Close()
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $path = $request.Url.AbsolutePath

    if ($path -eq '/api/data') {
      if ($request.HttpMethod -eq 'GET') {
        if (-not (Test-Path $dataFile)) {
          '{"holdings":[],"fxRate":null,"fxUpdatedAt":null,"apiConfig":{"finnhubKey":""},"savedAt":null}' | Set-Content -Path $dataFile -Encoding UTF8
        }
        Write-JsonResponse $context 200 ([System.IO.File]::ReadAllText($dataFile, [System.Text.Encoding]::UTF8))
        continue
      }

      if ($request.HttpMethod -eq 'PUT') {
        $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
        $body = $reader.ReadToEnd()
        $reader.Close()
        [System.IO.File]::WriteAllText($dataFile, $body, [System.Text.Encoding]::UTF8)
        Write-JsonResponse $context 200 '{"ok":true}'
        continue
      }

      Write-JsonResponse $context 405 '{"error":"Method not allowed"}'
      continue
    }

    $relative = if ($path -eq '/' -or [string]::IsNullOrWhiteSpace($path)) { 'index.html' } else { $path.TrimStart('/') }
    $target = Join-Path $root $relative
    Write-FileResponse $context $target
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}
