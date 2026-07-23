$dev = Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173" `
  -WorkingDirectory "C:\DEV_LOCAL\findyourvertical" `
  -PassThru

Write-Host "DEV_PID: $($dev.Id)"

Start-Sleep -Seconds 8

try {
  $response = Invoke-WebRequest http://127.0.0.1:5173 -UseBasicParsing -TimeoutSec 5
  Write-Host "STATUS: $($response.StatusCode)"
  Write-Host "SERVER_READY"
} catch {
  Write-Host "ERROR: $($_.Exception.Message)"
  # Check if port is already in use
  $portCheck = netstat -ano | Select-String ":5173 "
  if ($portCheck) {
    Write-Host "PORT 5173 IS IN USE:"
    Write-Host $portCheck
  }
}
