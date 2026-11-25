import base64
import io
import unittest
import wave
import time

import server


def hung_model(_config, deadline):
    deadline.value = time.monotonic() + 0.15
    while True:
        time.sleep(0.05)


class ValidationTests(unittest.TestCase):
    def test_supervisor_terminates_a_model_that_exceeds_its_deadline(self):
        started = time.monotonic()
        self.assertTrue(server.run_model_process({}, hung_model))
        self.assertLess(time.monotonic() - started, 6)

    def test_rejects_wrong_token_before_decoding_audio(self):
        with self.assertRaises(PermissionError):
            server.validate_request({}, "Bearer wrong", "secret")

    def test_rejects_broken_audio(self):
        with self.assertRaises(ValueError):
            server.validate_request({"text": "hello", "referenceText": "hello",
                                     "referenceAudio": base64.b64encode(b"bad").decode()}, "Bearer secret", "secret")

    def test_validates_reference_duration_and_text(self):
        audio = io.BytesIO()
        with wave.open(audio, "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(24000)
            out.writeframes(b"\0\0" * 24000 * 3)
        payload = {"text": "test", "referenceText": "reference",
                   "referenceAudio": base64.b64encode(audio.getvalue()).decode()}
        text, reference, samples = server.validate_request(payload, "Bearer secret", "secret")
        self.assertEqual(text, "test")
        self.assertEqual(reference, "reference")
        self.assertEqual(len(samples), 72000)
        payload["text"] = "x" * 201
        with self.assertRaises(ValueError):
            server.validate_request(payload, "Bearer secret", "secret")


if __name__ == "__main__":
    unittest.main()
