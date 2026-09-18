if ($PSVersionTable.PSVersion.Major -lt 7) { throw '需要 PowerShell 7 或更高版本。' }
if (-not $IsWindows) { throw '发布工具仅支持 Windows。' }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::SetHighDpiMode([System.Windows.Forms.HighDpiMode]::PerMonitorV2) | Out-Null
[System.Windows.Forms.Application]::EnableVisualStyles()
$publisherHome = Join-Path $env:LOCALAPPDATA 'BoyanKnowledgePublisher'
[System.IO.Directory]::CreateDirectory($publisherHome) | Out-Null
$settingsPath = Join-Path $publisherHome 'settings.json'
$script:publisherProcess = $null
$script:loginProcess = $null
$script:step = 0
$script:connected = $false
$script:environmentReady = $false
$script:resume = $false
$script:hasSavedSettings = $false
$ink = [System.Drawing.ColorTranslator]::FromHtml('#202124')
$muted = [System.Drawing.ColorTranslator]::FromHtml('#62666D')
$line = [System.Drawing.ColorTranslator]::FromHtml('#E4E6E9')
$accent = [System.Drawing.ColorTranslator]::FromHtml('#245C46')
$errorColor = [System.Drawing.ColorTranslator]::FromHtml('#AD3434')
$form = [System.Windows.Forms.Form]::new()
$form.Text = '知识库发布工具'
$form.ClientSize = [System.Drawing.Size]::new(900, 640)
$form.MinimumSize = [System.Drawing.Size]::new(916, 679)
$form.StartPosition = 'CenterScreen'
$form.Font = [System.Drawing.Font]::new('Microsoft YaHei UI', 10)
$form.AutoScaleMode = 'Dpi'
$form.BackColor = [System.Drawing.Color]::White
$form.ForeColor = $ink

function Add-Label($Parent, [string]$Text, [int]$X, [int]$Y, [int]$Width, [int]$Height, [int]$Size = 10, [bool]$Bold = $false) {
    $control = [System.Windows.Forms.Label]::new()
    $control.Text = $Text
    $control.SetBounds($X, $Y, $Width, $Height)
    $style = if ($Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $control.Font = [System.Drawing.Font]::new('Microsoft YaHei UI', $Size, $style)
    $control.Anchor = 'Top, Left, Right'
    $Parent.Controls.Add($control)
    return $control
}

function Add-Button($Parent, [string]$Text, [int]$X, [int]$Y, [int]$Width = 130, [bool]$Primary = $false) {
    $control = [System.Windows.Forms.Button]::new()
    $control.Text = $Text
    $control.SetBounds($X, $Y, $Width, 40)
    $control.FlatStyle = 'Flat'
    $control.FlatAppearance.BorderColor = $line
    $control.BackColor = if ($Primary) { $ink } else { [System.Drawing.Color]::White }
    $control.ForeColor = if ($Primary) { [System.Drawing.Color]::White } else { $ink }
    $control.Cursor = 'Hand'
    $Parent.Controls.Add($control)
    return $control
}

$sidebar = [System.Windows.Forms.Panel]::new()
$sidebar.Dock = 'Left'
$sidebar.Width = 202
$sidebar.BackColor = [System.Drawing.ColorTranslator]::FromHtml('#F5F6F7')
$form.Controls.Add($sidebar)
$brand = Add-Label $sidebar '博研知识库' 24 34 158 32 15 $true
$sideNote = Add-Label $sidebar '资料发布' 24 74 158 28
$sideNote.ForeColor = $muted
$stepNames = @('准备环境', '连接飞书', '选择资料', '发布')
$stepLabels = for ($i = 0; $i -lt 4; $i++) {
    $label = Add-Label $sidebar ("{0}   {1}" -f ($i + 1), $stepNames[$i]) 16 (142 + $i * 56) 170 44
    $label.TextAlign = 'MiddleLeft'
    $label.Padding = [System.Windows.Forms.Padding]::new(12, 0, 0, 0)
    $label
}
$localNote = Add-Label $sidebar "Windows 发布工具`n仅供资料维护者使用" 24 560 158 52 9
$localNote.ForeColor = $muted
$localNote.Anchor = 'Bottom, Left'
$main = [System.Windows.Forms.Panel]::new()
$main.Dock = 'Fill'
$main.Padding = [System.Windows.Forms.Padding]::new(32, 0, 32, 0)
$form.Controls.Add($main)
$main.BringToFront()
$header = [System.Windows.Forms.Panel]::new()
$header.Dock = 'Top'
$header.Size = [System.Drawing.Size]::new(634, 116)
$heading = Add-Label $header '准备好这台电脑' 0 30 634 38 21 $true
$subtitle = Add-Label $header '首次使用检查一次，已有配置会自动保留。' 0 78 634 30
$subtitle.ForeColor = $muted
$footer = [System.Windows.Forms.Panel]::new()
$footer.Dock = 'Bottom'
$footer.Size = [System.Drawing.Size]::new(634, 112)
$status = Add-Label $footer '' 0 4 634 42 9
$status.ForeColor = $muted
$back = Add-Button $footer '上一步' 0 58 104
$next = Add-Button $footer '下一步' 494 58 140 $true
$next.Anchor = 'Bottom, Right'
$progress = [System.Windows.Forms.ProgressBar]::new()
$progress.Dock = 'Top'
$progress.Height = 3
$progress.Style = 'Marquee'
$progress.Visible = $false
$footer.Controls.Add($progress)
$body = [System.Windows.Forms.Panel]::new()
$body.Dock = 'Fill'
$main.Controls.AddRange(@($body, $footer, $header))
$body.BringToFront()
$pages = for ($i = 0; $i -lt 4; $i++) {
    $page = [System.Windows.Forms.Panel]::new()
    $page.Dock = 'Fill'
    $page.AutoScroll = $true
    $body.Controls.Add($page)
    $page
}

$requirements = @(
    @{ Name = 'PowerShell 7'; Hint = '打开发布窗口'; Url = 'https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows' },
    @{ Name = 'Node.js 24'; Hint = '24.11.1 或更高的 24.x 版本'; Url = 'https://nodejs.org/en/download' },
    @{ Name = '飞书 CLI'; Hint = '连接你的飞书账号'; Url = 'https://github.com/larksuite/cli' }
)
$requirementLabels = for ($i = 0; $i -lt 3; $i++) {
    $row = $requirements[$i]
    $nameLabel = Add-Label $pages[0] $row.Name 0 (16 + $i * 90) 270 27 12 $true
    $hintLabel = Add-Label $pages[0] $row.Hint 0 (47 + $i * 90) 390 25 9
    $hintLabel.ForeColor = $muted
    $stateLabel = Add-Label $pages[0] '待检查' 388 (20 + $i * 90) 102 26 9
    $stateLabel.Anchor = 'Top, Right'
    $link = Add-Button $pages[0] '安装指南' 506 (16 + $i * 90) 126
    $link.Anchor = 'Top, Right'
    $link.Tag = $row.Url
    $link.Add_Click({ Start-Process $this.Tag })
    $stateLabel
}
$recheck = Add-Button $pages[0] '重新检查' 0 300 126
$resume = Add-Button $pages[0] '继续上次发布' 144 300 150
$environmentHint = Add-Label $pages[0] '安装后请重新打开工具，再检查一次。' 0 354 634 30 9
$environmentHint.ForeColor = $muted

$loginTitle = Add-Label $pages[1] '使用自己的飞书账号' 0 12 634 32 14 $true
$loginHint = Add-Label $pages[1] '账号需能查看公司知识空间及其引用文档。' 0 52 634 28
$loginHint.ForeColor = $muted
$configure = Add-Button $pages[1] '配置应用' 0 104 126
$login = Add-Button $pages[1] '登录飞书' 142 104 126
$verify = Add-Button $pages[1] '检查连接' 284 104 126
$authState = Add-Label $pages[1] '完成登录后，点击“检查连接”。' 0 167 634 54 11
$profileLabel = Add-Label $pages[1] '配置名称（可选）' 0 247 634 28 9
$profileLabel.ForeColor = $muted
$profileBox = [System.Windows.Forms.TextBox]::new()
$profileBox.PlaceholderText = '留空使用默认配置'
$profileBox.SetBounds(0, 280, 410, 32)
$profileBox.Anchor = 'Top, Left, Right'
$pages[1].Controls.Add($profileBox)
$accountNote = Add-Label $pages[1] '首次使用先配置公司应用，再登录个人账号。' 0 333 634 44 9
$accountNote.ForeColor = $muted

$toolTip = [System.Windows.Forms.ToolTip]::new()
function Add-PathField([string]$Title, [int]$Top, [string]$Placeholder, [bool]$Folder = $false) {
    $label = Add-Label $pages[2] $Title 0 $Top 634 26 10 $true
    $box = [System.Windows.Forms.TextBox]::new()
    $box.PlaceholderText = $Placeholder
    $box.SetBounds(0, $Top + 32, 526, 30)
    $box.Anchor = 'Top, Left, Right'
    $box.AccessibleName = $Title
    $box.TabIndex = [int][Math]::Floor($Top / 88) * 2
    $button = Add-Button $pages[2] '选择' 542 ($Top + 28) 90
    $button.Anchor = 'Top, Right'
    $button.TabIndex = $box.TabIndex + 1
    $button.Tag = @{ Box = $box; Folder = $Folder; Title = $Title }
    $button.Add_Click({
        $dialog = if ($this.Tag.Folder) { [System.Windows.Forms.FolderBrowserDialog]::new() } else { [System.Windows.Forms.OpenFileDialog]::new() }
        if (-not $this.Tag.Folder) {
            $dialog.Title = $this.Tag.Title
            $dialog.Filter = if ($this.Tag.Title -eq '公司发布配置') { '发布配置 (*.json)|*.json' } else { '发布密钥 (*.pem)|*.pem|所有文件 (*.*)|*.*' }
        }
        if ($dialog.ShowDialog($form) -eq 'OK') {
            $this.Tag.Box.Text = if ($this.Tag.Folder) { $dialog.SelectedPath } else { $dialog.FileName }
        }
        $dialog.Dispose()
    })
    $box.Add_TextChanged({
        $toolTip.SetToolTip($this, $this.Text)
        $status.Text = ''
        $status.ForeColor = $muted
    })
    $pages[2].Controls.Add($box)
    return $box
}
$configBox = Add-PathField '公司发布配置' 8 '选择维护者提供的 publisher.json'
$keyBox = Add-PathField '发布密钥' 96 '选择单独交接的 .pem 文件'
$directoryBox = Add-PathField '统一发布目录' 184 '选择公司共享目录或完整交接的发布目录' $true
$filesHint = Add-Label $pages[2] '沿用公司的配置、密钥和目录，换电脑也能继续原有版本。' 0 274 634 44 9
$filesHint.ForeColor = $muted
$setupLink = [System.Windows.Forms.LinkLabel]::new()
$setupLink.Text = '维护者：首次建立发布配置'
$setupLink.SetBounds(0, 332, 290, 28)
$setupLink.LinkColor = $muted
$setupLink.ActiveLinkColor = $ink
$pages[2].Controls.Add($setupLink)
$generate = Add-Button $pages[2] '创建发布密钥' 304 323 166
$generate.Visible = $false
$setupLink.Add_LinkClicked({ $generate.Visible = -not $generate.Visible })

$summaryTitle = Add-Label $pages[3] '' 0 12 634 38 17 $true
$modeLabel = Add-Label $pages[3] '' 0 65 634 30 11 $true
$modeHint = Add-Label $pages[3] '' 0 107 634 58
$modeHint.ForeColor = $muted
$targetCaption = Add-Label $pages[3] '保存到' 0 185 634 26 9
$targetCaption.ForeColor = $muted
$targetPath = Add-Label $pages[3] '' 0 218 634 56
$targetPath.AutoEllipsis = $true
$resultLabel = Add-Label $pages[3] '点击下方按钮，读取飞书最新资料。' 0 295 634 68 11
$openFolder = Add-Button $pages[3] '打开目录' 0 365 126
$openFolder.Visible = $false
$openFolder.Add_Click({ if (Test-Path -LiteralPath $directoryBox.Text -PathType Container) { Invoke-Item -LiteralPath $directoryBox.Text } })

function Show-Failure([string]$Message) {
    $status.ForeColor = $errorColor
    $status.Text = $Message
}

function Save-Settings {
    [ordered]@{ configPath = $configBox.Text.Trim(); privateKeyPath = $keyBox.Text.Trim(); releaseDirectory = $directoryBox.Text.Trim(); profile = $profileBox.Text.Trim() } |
        ConvertTo-Json | Set-Content -LiteralPath $settingsPath -Encoding utf8
}

function Test-Selection {
    if (-not (Test-Path -LiteralPath $configBox.Text -PathType Leaf)) { Show-Failure '请选择公司的发布配置文件。'; return $false }
    try {
        $config = Get-Content -Raw -LiteralPath $configBox.Text | ConvertFrom-Json
        if ($config.schemaVersion -ne 1 -or -not $config.publicKey -or -not $config.name -or -not $config.wiki) { throw 'invalid' }
    } catch { Show-Failure '配置文件不完整，请选择维护者提供的 publisher.json。'; return $false }
    if (-not (Test-Path -LiteralPath $keyBox.Text -PathType Leaf)) { Show-Failure '请选择公司的发布密钥文件。'; return $false }
    if (-not [System.IO.Path]::IsPathFullyQualified($directoryBox.Text) -or -not (Test-Path -LiteralPath $directoryBox.Text -PathType Container)) {
        Show-Failure '请选择已有的统一发布目录。'; return $false
    }
    return $true
}

function Show-Step([int]$Index) {
    $script:step = $Index
    for ($i = 0; $i -lt 4; $i++) {
        $pages[$i].Visible = $i -eq $Index
        $stepLabels[$i].BackColor = if ($i -eq $Index) { [System.Drawing.ColorTranslator]::FromHtml('#E5E8EB') } else { $sidebar.BackColor }
        $stepLabels[$i].ForeColor = if ($i -eq $Index) { $ink } else { $muted }
    }
    $pages[$Index].BringToFront()
    $heading.Text = @('准备好这台电脑', '连接飞书', '选择发布资料', '准备发布')[$Index]
    $subtitle.Text = @('首次使用检查一次，已有配置会自动保留。', '使用自己的账号，读取有权访问的资料。', '这三个位置配置一次，之后自动记住。', '读取最新资料，生成签名知识包。')[$Index]
    $status.Text = ''
    $status.ForeColor = $muted
    $back.Visible = $Index -gt 0
    $next.Text = '下一步'
    $next.Enabled = switch ($Index) { 0 { $script:environmentReady }; 1 { $script:connected }; default { $true } }
    if ($Index -eq 3) {
        $resultLabel.Text = '点击下方按钮，读取飞书最新资料。'
        $resultLabel.ForeColor = $ink
        $openFolder.Visible = $false
        $config = Get-Content -Raw -LiteralPath $configBox.Text | ConvertFrom-Json
        $summaryTitle.Text = $config.name
        $targetPath.Text = $directoryBox.Text
        $toolTip.SetToolTip($targetPath, $directoryBox.Text)
        if ($config.manifestUrl) {
            $modeLabel.Text = '在线发布'
            $modeLabel.ForeColor = $accent
            $modeHint.Text = '写入网站目录后验证下载。合作方会收到更新提示。'
            $next.Text = '发布最新资料'
        } else {
            $modeLabel.Text = '仅生成文件'
            $modeLabel.ForeColor = $muted
            $modeHint.Text = '尚未设置下载地址。文件保存在指定目录，合作方暂时不会收到更新。'
            $next.Text = '生成发布文件'
        }
    }
    $form.AcceptButton = $next
}

function Check-Environment {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $version = if ($node) { & $node.Source --version }
    $nodeReady = $version -match '^v24\.' -and [version]$version.TrimStart('v') -ge [version]'24.11.1'
    $states = @($true, $nodeReady, [bool](Get-Command lark-cli -ErrorAction SilentlyContinue))
    for ($i = 0; $i -lt 3; $i++) {
        $requirementLabels[$i].Text = if ($states[$i]) { '已就绪' } else { '需要安装' }
        $requirementLabels[$i].ForeColor = if ($states[$i]) { $accent } else { $errorColor }
    }
    $script:environmentReady = $states -notcontains $false -and [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'X64'
    if (-not $script:environmentReady) { Show-Failure '需要 Windows x64 和以上三个组件。安装后重新打开工具。' }
    $next.Enabled = $script:environmentReady
    $resume.Enabled = $script:environmentReady -and $script:hasSavedSettings
}

function Set-Busy([bool]$Busy) {
    $body.Enabled = -not $Busy
    $back.Enabled = -not $Busy
    $next.Enabled = -not $Busy
    $progress.Visible = $Busy
}

function Start-Publisher([string]$Action) {
    if ($script:publisherProcess -or $script:loginProcess) { return }
    if ($profileBox.Text -notmatch '^[a-zA-Z0-9_-]*$') { Show-Failure '配置名称只能使用字母、数字、下划线和连字符。'; return }
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { Show-Failure '未找到 Node.js，请返回第一步检查。'; return }
    $start = [System.Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $node.Source
    $start.WorkingDirectory = $publisherHome
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $start.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    $arguments = @((Join-Path $PSScriptRoot 'publisher.cjs'), '--action', $Action)
    switch ($Action) {
        'auth' { if ($profileBox.Text) { $arguments += @('--profile', $profileBox.Text) } }
        'keygen' { $arguments += @('--config', $configBox.Text) }
        'publish' { $arguments += @('--settings', $settingsPath) }
    }
    foreach ($argument in $arguments) { $start.ArgumentList.Add($argument) }
    try {
        $script:operation = $Action
        if ($Action -eq 'publish') {
            $heading.Text = '正在处理'
            $resultLabel.Text = '正在读取飞书资料，请保持联网。'
            $resultLabel.ForeColor = $ink
            $openFolder.Visible = $false
        }
        $script:result = $null
        $script:outputEnded = $false
        $script:publisherProcess = [System.Diagnostics.Process]::Start($start)
        $script:lineTask = $script:publisherProcess.StandardOutput.ReadLineAsync()
        $script:errorTask = $script:publisherProcess.StandardError.ReadToEndAsync()
        Set-Busy $true
        $status.ForeColor = $muted
        $status.Text = switch ($Action) { 'auth' { '正在检查飞书连接…' }; 'keygen' { '正在创建发布密钥…' }; default { '正在读取飞书资料…' } }
    } catch { $script:publisherProcess = $null; Show-Failure '无法启动程序，请检查工具文件和 Node.js。' }
}

$profileBox.Add_TextChanged({
    $script:connected = $false
    $authState.Text = '完成登录后，点击“检查连接”。'
    $authState.ForeColor = $ink
    if ($script:step -eq 1) { $next.Enabled = $false }
})
$recheck.Add_Click({ Check-Environment })
$back.Add_Click({ Show-Step ($script:step - 1) })
$next.Add_Click({
    switch ($script:step) {
        0 { Show-Step 1 }
        1 { if ($script:connected) { Show-Step 2 } }
        2 { if (Test-Selection) { try { Save-Settings; Show-Step 3 } catch { Show-Failure '无法保存设置，请检查本机目录权限。' } } }
        3 { if (Test-Selection) { try { Save-Settings; Start-Publisher 'publish' } catch { Show-Failure '无法保存设置，请检查本机目录权限。' } } }
    }
})
$resume.Add_Click({ $script:resume = $true; Show-Step 1; Start-Publisher 'auth' })
$verify.Add_Click({ $script:resume = $false; Start-Publisher 'auth' })
$generate.Add_Click({
    if (-not (Test-Path -LiteralPath $configBox.Text -PathType Leaf)) { Show-Failure '请先选择公司配置或 publisher.example.json。'; return }
    Start-Publisher 'keygen'
})
$loginHandler = {
    if ($script:loginProcess -or $script:publisherProcess) { return }
    if ($profileBox.Text -notmatch '^[a-zA-Z0-9_-]*$') { Show-Failure '配置名称只能使用字母、数字、下划线和连字符。'; return }
    $arguments = @('-NoLogo', '-NoProfile', '-File', ('"{0}"' -f (Join-Path $PSScriptRoot 'FeishuLogin.ps1')))
    if ($profileBox.Text) { $arguments += @('-Profile', $profileBox.Text) }
    if ($this -eq $configure) { $arguments += '-Configure' }
    try {
        $script:connected = $false
        $script:loginProcess = Start-Process -FilePath (Get-Command pwsh.exe).Source -ArgumentList $arguments -WindowStyle Normal -PassThru
        Set-Busy $true
        $status.Text = '请在打开的窗口完成操作，关闭后自动检查连接。'
        $status.ForeColor = $muted
    } catch { Show-Failure '无法打开飞书登录，请返回第一步检查环境。' }
}
$login.Add_Click($loginHandler)
$configure.Add_Click($loginHandler)

$configBox.Text = Join-Path $PSScriptRoot 'publisher.example.json'
if (Test-Path -LiteralPath (Join-Path $publisherHome 'publisher.json')) {
    $configBox.Text = Join-Path $publisherHome 'publisher.json'
    $keyBox.Text = Join-Path $publisherHome 'knowledge-release.pem'
}
if (Test-Path -LiteralPath $settingsPath) {
    try {
        $saved = Get-Content -Raw -LiteralPath $settingsPath | ConvertFrom-Json
        $configBox.Text = $saved.configPath
        $keyBox.Text = $saved.privateKeyPath
        $directoryBox.Text = $saved.releaseDirectory
        $profileBox.Text = $saved.profile
        $script:hasSavedSettings = $true
    } catch { }
}
$resume.Visible = $script:hasSavedSettings
$timer = [System.Windows.Forms.Timer]::new()
$timer.Interval = 200
$timer.Add_Tick({
    if ($script:loginProcess -and $script:loginProcess.HasExited) {
        $script:loginProcess.Dispose()
        $script:loginProcess = $null
        Set-Busy $false
        Start-Publisher 'auth'
    }
    if (-not $script:publisherProcess) { return }
    try {
        $count = 0
        while (-not $script:outputEnded -and $script:lineTask.IsCompleted -and $count -lt 100) {
            $raw = $script:lineTask.GetAwaiter().GetResult()
            if ($null -eq $raw) { $script:outputEnded = $true; break }
            $message = $raw | ConvertFrom-Json
            if ($message.type -eq 'progress') { $status.Text = $message.message }
            else { $script:result = $message }
            $script:lineTask = $script:publisherProcess.StandardOutput.ReadLineAsync()
            $count++
        }
        if (-not $script:publisherProcess.HasExited -or -not $script:outputEnded) { return }
        $result = $script:result
        $exitCode = $script:publisherProcess.ExitCode
        $script:publisherProcess.Dispose()
        $script:publisherProcess = $null
        Set-Busy $false
        if ($exitCode -ne 0 -or $result.type -eq 'error') {
            $failure = if ($result.type -eq 'error') { $result.message } else { '操作未完成，请检查网络和配置后重试。' }
            Show-Failure $failure
            if ($script:operation -eq 'publish') { $heading.Text = '未完成发布'; $resultLabel.Text = '请根据下方提示处理后重试。' }
            if ($script:operation -eq 'auth') { $script:connected = $false; $authState.Text = '尚未连接'; $next.Enabled = $false }
            return
        }
        switch ($result.type) {
            'auth' {
                $script:connected = $true
                $authState.Text = '已连接：{0}' -f $result.name
                $authState.ForeColor = $accent
                $status.Text = '登录和读取授权已确认。'
                $next.Enabled = $true
                if ($script:resume) {
                    $script:resume = $false
                    if (Test-Selection) { Show-Step 3 } else { Show-Step 2; Show-Failure '上次的文件位置已变化，请重新选择。' }
                }
            }
            'keys' {
                $keyBox.Text = $result.privateKeyPath
                $configBox.Text = $result.configPath
                $generate.Visible = $false
                $status.Text = '配置和密钥已创建。请选择统一发布目录。'
            }
            'result' {
                $heading.Text = if ($result.mode -eq 'published') { '发布完成' } else { '文件已生成' }
                $resultLabel.ForeColor = $accent
                $resultLabel.Text = "版本 {0}　共 {1} 篇正文`n新增 {2}　更新 {3}　移除 {4}" -f $result.sequence, $result.bodies, $result.added, $result.changed, $result.removed
                $status.Text = if ($result.mode -eq 'published') { '下载验证通过，合作方可以检查更新。' } else { '文件已保存。配置下载地址后，才能通知合作方更新。' }
                $openFolder.Visible = $true
            }
            default { Show-Failure '程序未返回有效结果，请检查工具文件后重试。' }
        }
    } catch {
        Show-Failure '程序返回异常，请等待任务结束后重试。'
        if ($script:publisherProcess -and $script:publisherProcess.HasExited) {
            $script:publisherProcess.Dispose()
            $script:publisherProcess = $null
            Set-Busy $false
            if ($script:step -eq 1) { $next.Enabled = $script:connected }
        }
    }
})
$form.Add_FormClosing({ param($sender, $eventArgs)
    if ($script:publisherProcess -or $script:loginProcess) {
        $eventArgs.Cancel = $true
        Show-Failure '任务仍在运行，请完成后关闭。'
    }
})
Show-Step 0
$form.Add_Shown({ Check-Environment })
$timer.Start()
[void]$form.ShowDialog()
$timer.Stop()
$timer.Dispose()
$toolTip.Dispose()
$form.Dispose()
