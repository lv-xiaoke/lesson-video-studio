"""Isolated Windows CPU install. Downloads remain in data; never recursively deletes."""
import hashlib
import json
import os
import secrets
import subprocess
import sys
import tarfile
import urllib.request
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def configured_data_root():
    # Use Node's own .env parser, exactly as Web/Worker do; print only DATA_DIR, never keys.
    output = subprocess.check_output(["node", "--env-file-if-exists=.env.local", "-e",
                                     "console.log(require('node:path').resolve(process.env.DATA_DIR || 'data'))"], cwd=ROOT, text=True)
    return Path(output.strip())


DATA = configured_data_root() / "zipvoice"
BASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/"
FILES = {
    "sherpa-onnx-zipvoice-distill-int8-zh-en-emilia.tar.bz2": BASE + "tts-models/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia.tar.bz2",
    "vocos_24khz.onnx": BASE + "vocoder-models/vocos_24khz.onnx",
    "lexicon-en-us.txt": BASE + "tts-models/lexicon-en-us.txt",
    "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2": BASE + "asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2",
}


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    runtime = DATA / "runtime"
    python = runtime / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.exists():
        venv.EnvBuilder(with_pip=True).create(runtime)
    subprocess.run([str(python), "-m", "pip", "install", "--disable-pip-version-check", "-r", str(ROOT / "tools/zipvoice/requirements.txt")], check=True)
    subprocess.run([str(python), "-c", "import sherpa_onnx; assert hasattr(sherpa_onnx, 'OfflineTtsZipvoiceModelConfig')"], check=True)
    models = DATA / "models"
    models.mkdir(exist_ok=True)
    manifest_file = ROOT / "tools/zipvoice/model-checksums.json"
    manifest = json.loads(manifest_file.read_text()) if manifest_file.exists() else {}
    measured = {}
    for name, url in FILES.items():
        path = models / name
        if not path.exists():
            print("Downloading " + name, flush=True)
            temporary = models / (name + ".partial")
            with urllib.request.urlopen(url, timeout=60) as source, temporary.open("wb") as target:
                while chunk := source.read(1024 * 1024):
                    target.write(chunk)
            temporary.replace(path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if name in manifest and manifest[name] != digest:
            raise ValueError("Model SHA256 mismatch: " + name)
        measured[name] = digest
        print(name + ": " + str(path.stat().st_size) + " bytes, SHA256 " + digest, flush=True)
    (DATA / "download-checksums.json").write_text(json.dumps(measured, indent=2))
    for archive_name in [name for name in FILES if name.endswith('.tar.bz2')]:
      with tarfile.open(models / archive_name, "r:bz2") as archive:
        for member in archive.getmembers():
            # Exclude bundled celebrity demonstration recordings. Extract regular model files only.
            target = (models / member.name).resolve()
            if not target.is_relative_to(models.resolve()) or member.issym() or member.islnk():
                raise ValueError("Unsafe archive entry")
            if "test_wavs" in Path(member.name).parts or not member.isfile():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as source, target.open("wb") as output:
                output.write(source.read())
    config_file = DATA / "service.json"
    if not config_file.exists():
        config_file.write_text(json.dumps({"token": secrets.token_urlsafe(32), "port": 8765,
                                         "modelDir": str(models)}, indent=2))
    print("ZipVoice installed. Start with scripts/start-zipvoice.ps1", flush=True)


if __name__ == "__main__":
    main()
