import { useParams } from 'react-router-dom';

export function WorkspaceSettingsPage() {
  const { workspaceId = '' } = useParams();
  return (
    <div className="p-6">
      <h2 className="mb-4">Workspace settings</h2>
      <p className="caption">Settings for workspace {workspaceId}.</p>
    </div>
  );
}
