"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSetNickname } from "@/lib/store/selections";

type Props = {
  billId: string;
  nickname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NicknameDialog({ billId, nickname, open, onOpenChange }: Props) {
  const setNickname = useSetNickname();
  const [draft, setDraft] = useState(nickname);

  useEffect(() => {
    if (open) setDraft(nickname);
  }, [nickname, open]);

  const save = () => {
    setNickname(billId, draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set your name</DialogTitle>
          <DialogDescription>Your nickname stays on this device and only appears in exports.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="nickname">Nickname</Label>
          <Input
            id="nickname"
            value={draft}
            maxLength={30}
            className="min-h-11 text-lg"
            placeholder="e.g. Billy"
            onChange={(event) => setDraft(event.target.value.slice(0, 30))}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
            }}
          />
          <p className="text-xs text-muted-foreground">{draft.length}/30 characters</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="min-h-11" onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
