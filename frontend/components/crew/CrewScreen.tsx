"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { EmptyState } from "@/components/common/EmptyState";
import { ConnectServerCard } from "@/components/sync/ConnectServerCard";
import { getLastCheckinDates } from "@/lib/db/crewRepo";
import { getDb } from "@/lib/db/schema";
import { verifyAstronautPin } from "@/lib/db/repo";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";
import { ConsentGate } from "./ConsentGate";
import { CrewCard } from "./CrewCard";
import { PinPad } from "./PinPad";
import { RegisterAstronautForm } from "./RegisterAstronautForm";

/** SPEC §8.3 screen 0: the first screen of the app, and what the (app)
 * layout falls back to whenever no astronaut is unlocked. */
export function CrewScreen() {
  const astronauts = useLiveQuery(() => getDb().astronauts.toArray());
  const lastCheckinDates = useLiveQuery(() => getLastCheckinDates());
  const setActiveAstronaut = useActiveAstronautStore(
    (s) => s.setActiveAstronaut,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  async function handlePinSubmit(pin: string) {
    if (!selectedId) return;
    const ok = await verifyAstronautPin(selectedId, pin);
    if (ok) {
      setActiveAstronaut(selectedId);
      setSelectedId(null);
      setPinError(null);
    } else {
      setPinError("Incorrect PIN. Try again.");
    }
  }

  const selectedAstronaut = astronauts?.find((a) => a.id === selectedId);

  if (selectedAstronaut) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-10">
        <h1 className="text-lg font-semibold">
          {selectedAstronaut.name} · {selectedAstronaut.crewCode}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Enter your PIN
        </p>
        <PinPad
          onSubmit={handlePinSubmit}
          submitLabel="Unlock"
          error={pinError}
        />
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            setPinError(null);
          }}
          className="min-h-11 text-sm text-zinc-600 underline dark:text-zinc-400"
        >
          Back to crew
        </button>
      </div>
    );
  }

  return (
    <ConsentGate>
      <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-10">
        <h1 className="text-xl font-semibold">Crew</h1>

        {astronauts === undefined ||
        showRegisterForm ? null : astronauts.length === 0 ? (
          <EmptyState
            title="No astronauts registered yet"
            action={{
              label: "Register astronaut",
              onClick: () => setShowRegisterForm(true),
            }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {astronauts.map((astronaut) => (
              <CrewCard
                key={astronaut.id}
                astronaut={astronaut}
                lastCheckinDate={lastCheckinDates?.[astronaut.id]}
                onSelect={(id) => {
                  setSelectedId(id);
                  setPinError(null);
                }}
              />
            ))}
          </div>
        )}

        {astronauts !== undefined &&
          astronauts.length > 0 &&
          !showRegisterForm && (
            <button
              type="button"
              onClick={() => setShowRegisterForm(true)}
              className="min-h-11 self-start text-sm font-medium text-zinc-700 underline dark:text-zinc-300"
            >
              + Register another astronaut
            </button>
          )}

        {astronauts !== undefined && !showRegisterForm && <ConnectServerCard />}

        {showRegisterForm && (
          <>
            <RegisterAstronautForm
              onRegistered={(id) => {
                setShowRegisterForm(false);
                setSelectedId(id);
              }}
            />
            <button
              type="button"
              onClick={() => setShowRegisterForm(false)}
              className="min-h-11 self-start text-sm text-zinc-600 underline dark:text-zinc-400"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </ConsentGate>
  );
}
