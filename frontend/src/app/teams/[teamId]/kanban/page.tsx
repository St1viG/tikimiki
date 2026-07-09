import { KanbanClient } from "./KanbanClient";

export default function KanbanPage({ params }: { params: { teamId: string } }) {
  return <KanbanClient teamId={params.teamId} />;
}
