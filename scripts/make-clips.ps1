# Makes placeholder test-caller clips with Windows text to speech.
#
# These are stand-ins so the lab runs end to end. A person reading the same lines
# sounds more natural, and the audio turn detector listens to intonation, so record
# real clips before showing the lab: same file names, 48 kHz mono WAV.
#
# Usage: powershell -File scripts/make-clips.ps1 [-Voice "Microsoft Zira Desktop"]
param([string]$Voice = '')

Add-Type -AssemblyName System.Speech

$out = Join-Path $PSScriptRoot '..\web\public\clips'
New-Item -ItemType Directory -Force $out | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($Voice) {
    $synth.SelectVoice($Voice)
} else {
    $english = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'en-US' } | Select-Object -First 1
    if ($english) { $synth.SelectVoice($english.VoiceInfo.Name) }
}
$synth.Rate = -1

$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
    48000,
    [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono
)

# The pauses in the table booking sit inside one sentence, so the voice keeps a
# mid-sentence intonation across them, the way a person thinking would.
$clips = [ordered]@{
    'exp1-table-booking' = "I'd like a table for <break time='1800ms'/> four people on <break time='1800ms'/> Friday at seven."
    'exp2-menu-question' = "What's on the menu tonight?"
    'exp2-uh-huh'        = 'Uh-huh.'
    'exp2-vegetarian'    = 'Wait, do you have anything vegetarian?'
}

foreach ($name in $clips.Keys) {
    $path = Join-Path $out "$name.wav"
    $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>$($clips[$name])<break time='300ms'/></speak>"
    $synth.SetOutputToWaveFile($path, $format)
    $synth.SpeakSsml($ssml)
    $synth.SetOutputToNull()
    Write-Output "Wrote $path with $($synth.Voice.Name)"
}
$synth.Dispose()
