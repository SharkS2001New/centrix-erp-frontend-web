"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { useSpa } from "@/lib/spa/store";
import { Button, Card, Field, PageHeader, inputClass } from "@/components/spa/ui";

export function RoomsScreen() {
  const spa = useSpa();
  const [room, setRoom] = useState({ name: "", kind: "" });
  const [chair, setChair] = useState({ name: "" });
  const [editingRoom, setEditingRoom] = useState(null);
  const [editingChair, setEditingChair] = useState(null);

  function saveRoom(event) {
    event.preventDefault();
    const error = spa.saveRoom(editingRoom ? { ...room, id: editingRoom } : room);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(editingRoom ? "Room updated." : "Room added.");
    setRoom({ name: "", kind: "" });
    setEditingRoom(null);
  }

  function saveChair(event) {
    event.preventDefault();
    const error = spa.saveChair(editingChair ? { ...chair, id: editingChair } : chair);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(editingChair ? "Chair updated." : "Chair added.");
    setChair({ name: "" });
    setEditingChair(null);
  }

  return (
    <div>
      <PageHeader title="Rooms & resources" detail="Manage treatment rooms and barber chairs used when booking appointments." />
      <div className="grid gap-4 xl:grid-cols-2">
        {spa.features.rooms ? (
          <Card>
            <h2 className="theme-heading font-semibold">Treatment rooms</h2>
            <form className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={saveRoom}>
              <Field label="Room name">
                <input className={inputClass} required value={room.name} onChange={(event) => setRoom({ ...room, name: event.target.value })} />
              </Field>
              <Field label="Room type">
                <input className={inputClass} value={room.kind} onChange={(event) => setRoom({ ...room, kind: event.target.value })} placeholder="Massage, facial…" />
              </Field>
              <div className="flex items-end gap-2">
                <Button type="submit">{editingRoom ? "Save" : "Add room"}</Button>
                {editingRoom ? <Button type="button" variant="ghost" onClick={() => { setEditingRoom(null); setRoom({ name: "", kind: "" }); }}>Cancel</Button> : null}
              </div>
            </form>
            <ul className="mt-4 divide-y">
              {spa.rooms.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <div><p className="theme-heading text-sm font-medium">{item.name}</p><p className="theme-subtext text-xs">{item.kind || "General"}</p></div>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={() => { setEditingRoom(item.id); setRoom({ name: item.name, kind: item.kind || "" }); }}>Edit</Button>
                    <Button type="button" variant="danger" onClick={() => { spa.removeRoom(item.id); toast.success("Room removed; linked appointments were unassigned."); }}>Remove</Button>
                  </div>
                </li>
              ))}
              {spa.rooms.length === 0 ? <li className="theme-subtext py-3 text-sm">No rooms added yet.</li> : null}
            </ul>
          </Card>
        ) : null}
        {spa.features.chairs ? (
          <Card>
            <h2 className="theme-heading font-semibold">Barber chairs</h2>
            <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={saveChair}>
              <div className="min-w-52 flex-1">
                <Field label="Chair name">
                <input className={inputClass} required value={chair.name} onChange={(event) => setChair({ name: event.target.value })} />
                </Field>
              </div>
              <div className="flex gap-2">
                <Button type="submit">{editingChair ? "Save" : "Add chair"}</Button>
                {editingChair ? <Button type="button" variant="ghost" onClick={() => { setEditingChair(null); setChair({ name: "" }); }}>Cancel</Button> : null}
              </div>
            </form>
            <ul className="mt-4 divide-y">
              {spa.chairs.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <p className="theme-heading text-sm font-medium">{item.name}</p>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={() => { setEditingChair(item.id); setChair({ name: item.name }); }}>Edit</Button>
                    <Button type="button" variant="danger" onClick={() => { spa.removeChair(item.id); toast.success("Chair removed; linked appointments were unassigned."); }}>Remove</Button>
                  </div>
                </li>
              ))}
              {spa.chairs.length === 0 ? <li className="theme-subtext py-3 text-sm">No chairs added yet.</li> : null}
            </ul>
          </Card>
        ) : null}
        {!spa.features.rooms && !spa.features.chairs ? (
          <Card className="xl:col-span-2">
            <p className="theme-subtext text-sm">Rooms and chairs are turned off for this business type. Enable them from <Link className="font-medium text-[var(--theme-accent-text)]" href="/spa/settings">SPA settings</Link>.</p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
