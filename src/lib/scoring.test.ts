import { describe, expect, it } from "vitest";
import { messageSeconds, rankMoments } from "./scoring.js";
describe("chat scoring", () => {
  it("parses TwitchDownloader comment offsets", () => expect(messageSeconds({ comments: [{ content_offset_seconds: 2 }, { content_offset_seconds: 21 }] })).toEqual([2, 21]));
  it("finds relative spikes, clamps the first start, and suppresses nearby peaks", () => {
    const seconds = [...Array(50).fill(0).map((_, i) => 10 + i / 20), ...Array(30).fill(0).map((_, i) => 30 + i / 20), ...Array(80).fill(0).map((_, i) => 200 + i / 20)];
    const moments = rankMoments(seconds, { top: 5, bucket: 10, baseline: 60, before: 20, after: 10, gap: 90 });
    expect(moments).toHaveLength(2); expect(moments[0].startSeconds).toBeGreaterThanOrEqual(0); expect(Math.abs(moments[0].spikeSeconds - moments[1].spikeSeconds)).toBeGreaterThanOrEqual(90);
  });
  it("handles a large VOD chat without spreading timestamps into Math.max", () => {
    const seconds = Array.from({ length: 200_000 }, (_, index) => index);
    expect(rankMoments(seconds)).not.toHaveLength(0);
  });
});
