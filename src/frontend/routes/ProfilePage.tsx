import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../../../convex/_generated/api';
import { LogOut, Save, User as UserIcon } from 'lucide-react';
import { Button } from '../components/ui/button';
import { AvatarUploader } from '../components/members/AvatarUploader';
import { convexRepository } from '../repository/ConvexCouncilRepository';

export function ProfilePage() {
  const user = useQuery(api.users.viewer);
  const updateUserMutation = useMutation(api.users.update);
  const { signOut } = useAuthActions();

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user]);

  const onSave = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await updateUserMutation({ name });
    } finally {
      setBusy(false);
    }
  };

  const onAvatarUpload = async (blob: Blob) => {
    setBusy(true);
    try {
      // 1. Get upload URL
      const uploadUrl = await convexRepository.generateUploadUrl();
      // 2. POST blob
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
      });
      const { storageId } = (await res.json()) as { storageId: string };
      // 3. Get public URL (though user.image in Convex Auth usually expects a URL)
      // For Convex Auth, we can use the storage ID directly if we handle it in users:viewer 
      // but usually 'image' is a string URL. Let's get the URL.
      // Wait, I don't have a direct ctx.storage.getUrl client side without a query.
      // I can add a query for it or just return it from a mutation.
      // Actually, convexRepository has no method for getUrl yet.
      // Let's just update the image string to the storageId and handle resolution in backend.
      await updateUserMutation({ image: storageId });
    } finally {
      setBusy(false);
    }
  };

  const displayName = user?.name ?? 'Council Member';
  const email = user?.email ?? '';
  const avatarUrl = user?.image;

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <div className="mb-8">
        <h1 className="font-display text-2xl">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your account details and preferences</p>
      </div>

      <div className="space-y-4">
        {/* Identity & Avatar */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <AvatarUploader
              currentAvatarUrl={avatarUrl}
              onUpload={onAvatarUpload}
            />

            <div className="flex-1 space-y-4 w-full">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Display Name</span>
                <input
                  className="h-10 w-full rounded-lg border border-border bg-background/50 px-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </label>

              <div className="grid gap-1.5 opacity-60">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Email Address</span>
                <p className="text-sm">{email || 'No email connected'}</p>
              </div>

              <Button
                onClick={() => void onSave()}
                disabled={busy || !name.trim() || name === user?.name}
                className="w-full gap-2 sm:w-auto"
              >
                <Save className="h-4 w-4" />
                Save changes
              </Button>
            </div>
          </div>
        </div>

        {/* Sign out */}
        <button
          id="signout-btn"
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground transition hover:border-destructive/50 hover:bg-destructive/5 hover:text-foreground active:scale-[0.98]"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
