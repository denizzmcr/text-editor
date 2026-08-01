# Registers Text Editor in the Windows "Open with" list for text and source
# files.
#
# Writes under HKCU only, so it needs no administrator rights and affects just
# the current user. Registering under OpenWithProgids (rather than setting the
# default handler) means the app is offered as a choice without taking over
# any file type -- the same intent as LSHandlerRank=Alternate on macOS.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/register-windows.ps1

$ErrorActionPreference = 'Stop'

$exe = Resolve-Path (Join-Path $PSScriptRoot '..\dist-app\text-editor.exe') -ErrorAction SilentlyContinue
if (-not $exe) {
    Write-Error 'No build found at dist-app\text-editor.exe. Run "npm run package" first.'
}

$progId = 'DenizTextEditor.Document'
$classes = 'HKCU:\Software\Classes'

New-Item -Path "$classes\$progId\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$classes\$progId" -Name '(Default)' -Value 'Text Document'
Set-ItemProperty -Path "$classes\$progId\shell\open\command" -Name '(Default)' -Value "`"$exe`" `"%1`""

# Extensions Windows may not already associate with a text editor. Listing them
# explicitly is the Windows equivalent of the UTI declarations on macOS.
$extensions = @(
    '.txt', '.md', '.markdown', '.html', '.htm', '.rs', '.toml', '.py', '.js',
    '.ts', '.tsx', '.jsx', '.json', '.css', '.xml', '.yml', '.yaml', '.ini',
    '.cfg', '.conf', '.log', '.csv', '.sh', '.go', '.c', '.h', '.cpp', '.java',
    '.rb', '.php', '.sql', '.lua', '.zig', '.kt', '.dart', '.env'
)

foreach ($ext in $extensions) {
    New-Item -Path "$classes\$ext\OpenWithProgids" -Force | Out-Null
    # Empty REG_NONE value is the documented way to list a ProgId here.
    New-ItemProperty -Path "$classes\$ext\OpenWithProgids" -Name $progId `
        -PropertyType None -Value ([byte[]]@()) -Force | Out-Null
}

Write-Host "Registered for $($extensions.Count) file types."
Write-Host 'Right-click a text file -> Open with -> Text Editor.'
