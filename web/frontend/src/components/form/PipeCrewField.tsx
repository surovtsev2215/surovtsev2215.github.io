import { CrewMemberPicker } from "./CrewMemberPicker";
import type { CrewMemberRef } from "../../types";
import type { CrewIsolatorPick } from "../../lib/crewApi";

type Props = {
  localId: string;
  crewMembers: CrewMemberRef[];
  onChange: (crewMembers: CrewMemberRef[]) => void;
  isolators: CrewIsolatorPick[];
  isolatorsLoading?: boolean;
  isolatorsError?: string | null;
  currentUserUid?: string;
  crewRequired?: boolean;
};

export function PipeCrewField({
  localId,
  crewMembers,
  onChange,
  isolators,
  isolatorsLoading,
  isolatorsError,
  currentUserUid,
  crewRequired
}: Props) {
  return (
    <CrewMemberPicker
      id={`pipe-crew-${localId}`}
      selected={crewMembers ?? []}
      onChange={onChange}
      isolators={isolators}
      loading={isolatorsLoading}
      error={isolatorsError}
      excludeUid={currentUserUid}
      required={crewRequired}
    />
  );
}
