import json, sys
import av
from faster_whisper import WhisperModel

input_path, output_path = sys.argv[1], sys.argv[2]
# Some PyAV builds do not yet support faster-whisper's metadata_errors option.
# Retrying without it keeps decoding compatible without affecting transcription.
_av_open = av.open
def compatible_open(*args, **kwargs):
    try:
        return _av_open(*args, **kwargs)
    except TypeError as error:
        if "metadata_errors" not in str(error):
            raise
        kwargs.pop("metadata_errors", None)
        return _av_open(*args, **kwargs)
av.open = compatible_open
model = WhisperModel("small.en", device="auto", compute_type="int8")
segments, _ = model.transcribe(input_path, language="en", word_timestamps=True, vad_filter=True)
rows = []
for segment in segments:
    for word in segment.words or []:
        rows.append({"start": word.start, "end": word.end, "word": word.word.strip()})
with open(output_path, "w", encoding="utf-8") as out: json.dump(rows, out)
