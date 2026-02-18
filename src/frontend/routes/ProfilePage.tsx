export function ProfilePage() {
  return <PlaceholderPage title="Profile" description="Profile setup is coming in a later milestone." />;
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <h1 className="font-display text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
