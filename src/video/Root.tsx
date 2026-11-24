import { Composition } from 'remotion';
import { LessonVideo, type LessonVideoProps } from './LessonVideo';
import { createExampleLesson, parseLesson } from '../shared/lesson';
import { totalFrames } from './timeline';
export function RemotionRoot() {
  return <Composition id="Lesson" component={LessonVideo} width={1920} height={1080} fps={30} durationInFrames={870}
    defaultProps={{ lesson: createExampleLesson() }}
    calculateMetadata={({ props }: { props: LessonVideoProps }) => ({ durationInFrames: totalFrames(parseLesson(props.lesson).scenes, 30, props.audio) })} />;
}
