import base64
import io
import unittest
import wave
from array import array
import asr


def wav(samples):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(24000)
        audio.writeframes(array("h", samples).tobytes())
    return base64.b64encode(output.getvalue()).decode()


class AsrTests(unittest.TestCase):
    def test_rejects_silence_invalid_and_short_audio(self):
        for value in ["bad", wav([0] * 72000), wav([400] * 1000)]:
            with self.assertRaises(ValueError):
                asr.decode_audio(value)

    def test_cleans_control_tags_but_keeps_spoken_content(self):
        self.assertEqual(asr.clean_text("<|zh|><|NEUTRAL|><|Speech|>你好，世界。"), "你好，世界。")
        with self.assertRaises(ValueError):
            asr.clean_text("<|nospeech|>")

    def test_reads_full_normalized_reference(self):
        samples = asr.decode_audio(wav([400, -400] * 36000))
        self.assertEqual(len(samples), 72000)


if __name__ == "__main__":
    unittest.main()
