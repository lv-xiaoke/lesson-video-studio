"""Private loopback CPU service. No model loading occurs on import."""
import base64
import hmac
import io
import json
import os
import threading
import time
import wave
from array import array
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MODEL_ID = "zipvoice-distill-int8-v1"


def validate_request(payload, authorization, token):
    if not token or not hmac.compare_digest(authorization or "", "Bearer " + token):
        raise PermissionError("Unauthorized")
    text, reference = payload.get("text"), payload.get("referenceText")
    if not isinstance(text, str) or not text.strip() or len(text) > 200:
        raise ValueError("Text must contain 1-200 characters")
    if not isinstance(reference, str) or not reference.strip() or len(reference) > 1000:
        raise ValueError("Reference transcript required (max 1000 characters)")
    try:
        raw = base64.b64decode(payload.get("referenceAudio", ""), validate=True)
        if len(raw) > 1_500_000:
            raise ValueError("Reference too large")
        with wave.open(io.BytesIO(raw), "rb") as audio:
            if audio.getnchannels() != 1 or audio.getsampwidth() != 2 or audio.getframerate() != 24000:
                raise ValueError("Reference must be mono 24kHz PCM16 WAV")
            if not 3 <= audio.getnframes() / 24000 <= 30:
                raise ValueError("Reference must be 3-30 seconds")
            samples = array("h", audio.readframes(audio.getnframes()))
    except (wave.Error, EOFError, TypeError, KeyError) as error:
        raise ValueError("Invalid reference WAV") from error
    return text, reference, samples


def load_engine(model_dir, threads):
    import sherpa_onnx
    base = Path(model_dir)
    model = base / "sherpa-onnx-zipvoice-distill-int8-zh-en-emilia"
    config = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        zipvoice=sherpa_onnx.OfflineTtsZipvoiceModelConfig(
            tokens=str(model / "tokens.txt"), encoder=str(model / "encoder.int8.onnx"),
            decoder=str(model / "decoder.int8.onnx"),
            lexicon=str(model / "lexicon.txt") + "," + str(base / "lexicon-en-us.txt"),
            vocoder=str(base / "vocos_24khz.onnx")),
        debug=False, num_threads=threads, provider="cpu"))
    if not config.validate():
        raise RuntimeError("Invalid ZipVoice model configuration")
    return sherpa_onnx.OfflineTts(config)


def serve(config):
    import numpy as np
    import sherpa_onnx
    started = time.monotonic()
    engine = load_engine(config["modelDir"], int(os.environ.get("ZIPVOICE_THREADS", "4")))
    loaded_seconds = time.monotonic() - started
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Never log transcripts or reference audio.

        def reply(self, status, body, content_type="application/json"):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def authorized(self):
            return hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + config["token"])

        def do_GET(self):
            if not self.authorized():
                return self.reply(401, b'{"error":"Unauthorized"}')
            if self.path != "/health":
                return self.reply(404, b'{}')
            self.reply(200, json.dumps({"ready": True, "model": MODEL_ID, "loadSeconds": round(loaded_seconds, 3)}).encode())

        def do_POST(self):
            if not self.authorized():
                return self.reply(401, b'{"error":"Unauthorized"}')
            if self.path != "/synthesize":
                return self.reply(404, b'{}')
            acquired = False
            try:
                self.connection.settimeout(30)
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 2_100_000:
                    raise ValueError("Invalid request size")
                payload = json.loads(self.rfile.read(length))
                text, reference, samples = validate_request(payload, self.headers.get("Authorization"), config["token"])
                acquired = lock.acquire(blocking=False)
                if not acquired:
                    return self.reply(409, b'{"error":"Engine busy"}')
                generation = sherpa_onnx.GenerationConfig()
                generation.reference_audio = np.array(samples, dtype=np.float32) / 32768.0
                generation.reference_sample_rate = 24000
                generation.reference_text = reference
                generation.num_steps = 4
                audio = engine.generate(text, generation)
                if not len(audio.samples):
                    raise ValueError("Empty generated audio")
                output = io.BytesIO()
                with wave.open(output, "wb") as wav:
                    wav.setnchannels(1)
                    wav.setsampwidth(2)
                    wav.setframerate(audio.sample_rate)
                    wav.writeframes((np.clip(audio.samples, -1, 1) * 32767).astype("<i2").tobytes())
                self.reply(200, output.getvalue(), "audio/wav")
            except (ValueError, TypeError, EOFError) as error:
                self.reply(400, json.dumps({"error": str(error)}).encode())
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception:
                self.reply(500, b'{"error":"Local synthesis failed; check service log"}')
            finally:
                if acquired:
                    lock.release()

    print(json.dumps({"ready": True, "loadSeconds": loaded_seconds}), flush=True)
    ThreadingHTTPServer(("127.0.0.1", int(config["port"])), Handler).serve_forever()


if __name__ == "__main__":
    import sys
    with open(sys.argv[1], encoding="utf-8") as source:
        settings = json.load(source)
    if not settings.get("token") or not 1024 <= int(settings["port"]) <= 65535:
        raise ValueError("Invalid local service settings")
    serve(settings)
