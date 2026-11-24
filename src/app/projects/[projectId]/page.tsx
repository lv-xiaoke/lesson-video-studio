import { Editor } from '@/features/editor/Editor';
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <Editor projectId={projectId} />;
}
