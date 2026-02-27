import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { useAppStore } from '../store/appStore';

export function ChamberMemberPage() {
  const { memberId } = useParams();
  const navigate = useNavigate();

  const member = useAppStore((state) =>
    memberId ? state.members.find((item) => item.id === memberId && !item.deletedAt) : undefined
  );
  const latestThread = useAppStore((state) =>
    memberId ? state.getLatestChamberThreadForMember(memberId) : undefined
  );
  const createChamberThread = useAppStore((state) => state.createChamberThread);

  useEffect(() => {
    if (latestThread) {
      navigate(`/chamber/${latestThread.id}`, { replace: true });
    }
  }, [latestThread, navigate]);

  if (!member || !memberId) {
    return <Placeholder title="Member not found" description="Choose an active member from the chambers list." />;
  }

  if (latestThread) {
    return <Placeholder title="Opening latest thread" description={`Loading ${member.name}'s most recent thread...`} />;
  }

  return (
    <div className="grid h-full place-items-center px-4 text-center">
      <div className="max-w-md">
        <h2 className="font-display text-2xl">No threads yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Start a new chamber thread with {member.name}.
        </p>
        <Button
          className="mt-5"
          onClick={() => {
            void createChamberThread(member.id).then((thread) => navigate(`/chamber/${thread.id}`));
          }}
        >
          New thread
        </Button>
      </div>
    </div>
  );
}

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid h-full place-items-center px-4 text-center">
      <div>
        <h2 className="font-display text-2xl">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
