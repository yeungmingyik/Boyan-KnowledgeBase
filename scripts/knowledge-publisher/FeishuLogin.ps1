param([string]$Profile = '', [switch]$Configure)
if ($PSVersionTable.PSVersion.Major -lt 7) { throw '需要 PowerShell 7 或更高版本。' }
if ($Profile -notmatch '^[a-zA-Z0-9_-]*$') { throw '配置名称只能包含字母、数字、下划线或连字符。' }
$larkArguments = @()
if ($Configure) {
    $larkArguments += @('config', 'init')
    if ($Profile) { $larkArguments += @('--name', $Profile) }
} else {
    if ($Profile) { $larkArguments += @('--profile', $Profile) }
    $larkArguments += @('auth', 'login', '--scope', 'wiki:node:retrieve docx:document:readonly')
}
& lark-cli @larkArguments
Read-Host '按 Enter 关闭'
