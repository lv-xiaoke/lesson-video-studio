import { AbsoluteFill, Sequence, Html5Audio } from 'remotion';
import type { Lesson } from '../shared/lesson';
import { buildTimeline } from './timeline';
import { TeachingScene } from './scenes/TeachingScene';
import type { PreviewAudio } from '../shared/narration';
export type LessonVideoProps = { lesson: Lesson; audio?: PreviewAudio };
export function LessonVideo({ lesson, audio = {} }: LessonVideoProps) {
  return <AbsoluteFill className="lesson-video" style={{ background: '#101e27', fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif', color: '#edf6f3', lineHeight: 1.7, boxSizing: 'border-box', fontSize: 24 }}>
    <style>{'.lesson-video, .lesson-video * { box-sizing: border-box; }'}</style>
    {buildTimeline(lesson.scenes, 30, audio).map(({ scene, from, durationInFrames }, index) => <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
      <TeachingScene scene={scene} index={index} total={lesson.scenes.length} />
      {audio[scene.id] && <Html5Audio src={audio[scene.id].src} />}
    </Sequence>)}
  </AbsoluteFill>;
}
