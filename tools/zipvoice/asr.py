"""Small offline ASR sharing sherpa-onnx with the local voice engine."""
import base64
import io
import re
import wave
from array import array
from pathlib import Path

MODEL_FOLDER = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17"


def load_recognizer(model_dir):
    import sherpa_onnx
    folder = Path(model_dir) / MODEL_FOLDER
    if not (folder / "model.int8.onnx").is_file() or not (folder / "tokens.txt").is_file():
        return None
    return sherpa_onnx.OfflineRecognizer.from_sense_voice(
        model=str(folder / "model.int8.onnx"), tokens=str(folder / "tokens.txt"),
        num_threads=2, provider="cpu", language="auto", use_itn=True, debug=False)


def decode_audio(encoded):
    try:
        if not isinstance(encoded, str) or len(encoded) > 2_000_000:
            raise ValueError("Invalid audio size")
        raw = base64.b64decode(encoded, validate=True)
        with wave.open(io.BytesIO(raw), "rb") as wav:
            if wav.getnchannels() != 1 or wav.getsampwidth() != 2 or wav.getframerate() != 24000:
                raise ValueError("Expected mono 24kHz PCM16")
            if not 3 <= wav.getnframes() / 24000 <= 30:
                raise ValueError("Expected 3-30 seconds")
            samples = array("h", wav.readframes(wav.getnframes()))
            if len(samples) != wav.getnframes() or sum(abs(v) for v in samples) / len(samples) < 8:
                raise ValueError("Audio is incomplete or silent")
            return samples
    except (wave.Error, EOFError, TypeError) as error:
        raise ValueError("Invalid reference audio") from error


def clean_text(text):
    if not isinstance(text, str):
        raise ValueError("No speech recognized")
    text = re.sub(r"<\|[^>]*\|>", "", text).strip()
    if not text or len(text) > 1000:
        raise ValueError("No valid speech recognized")
    return text


def transcribe(recognizer, samples):
    import numpy as np
    stream = recognizer.create_stream()
    stream.accept_waveform(24000, np.array(samples, dtype=np.float32) / 32768.0)
    recognizer.decode_stream(stream)
    return clean_text(stream.result.text)
