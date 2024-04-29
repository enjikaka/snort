import { useState } from "react";
import { FormattedMessage } from "react-intl";
import { useNavigate } from "react-router-dom";

import AsyncButton from "@/Components/Button/AsyncButton";
import { ToggleSwitch } from "@/Components/Icons/Toggle";
import useModeration from "@/Hooks/useModeration";
import { FixedModeration } from "@/Pages/onboarding/fixedModeration";
import { appendDedupe } from "@/Utils";

export function Moderation() {
  const [topics, setTopics] = useState<Array<string>>(Object.keys(FixedModeration));
  const [extraTerms, setExtraTerms] = useState("");
  const navigate = useNavigate();
  const { addMutedWord } = useModeration();

  return (
    <div className="flex flex-col g24">
      <div className="flex flex-col g8 text-center">
        <h1>
          <FormattedMessage defaultMessage="Clean up your feed" />
        </h1>
        <FormattedMessage defaultMessage="Your space the way you want it 😌" />
      </div>
      <div className="flex flex-col g8">
        <div className="flex g8 items-center">
          <small className="grow uppercase font-semibold">
            <FormattedMessage defaultMessage="Lists to mute:" />
          </small>
          <span className="font-medium">
            <FormattedMessage defaultMessage="Toggle all" />
          </span>
          <ToggleSwitch
            size={50}
            onClick={() =>
              topics.length === Object.keys(FixedModeration).length
                ? setTopics([])
                : setTopics(Object.keys(FixedModeration))
            }
            className={topics.length === Object.keys(FixedModeration).length ? "active" : ""}
          />
        </div>
        {Object.entries(FixedModeration).map(([k, v]) => (
          <div className="flex g8 items-center bb" key={k}>
            <div className="font-semibold grow">{v.title}</div>
            {v.canEdit && (
              <div>
                <FormattedMessage defaultMessage="edit" />
              </div>
            )}
            <ToggleSwitch
              size={50}
              className={topics.includes(k) ? "active" : ""}
              onClick={() => setTopics(s => (topics.includes(k) ? s.filter(a => a !== k) : appendDedupe(s, [k])))}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col g8">
        <span className="font-semibold">
          <FormattedMessage defaultMessage="Additional Terms:" />
        </span>
        <small className="font-medium">
          <FormattedMessage defaultMessage="Use commas to separate words e.g. word1, word2, word3" />
        </small>
        <textarea onChange={e => setExtraTerms(e.target.value)} value={extraTerms}></textarea>
      </div>
      <AsyncButton
        className="primary"
        onClick={async () => {
          const words = Object.entries(FixedModeration)
            .filter(([k]) => topics.includes(k))
            .map(([, v]) => v.words)
            .flat()
            .concat(
              extraTerms
                .split(",")
                .map(a => a.trim())
                .filter(a => a.length > 1),
            );
          if (words.length > 0) {
            await addMutedWord(words);
          }
          navigate("/");
        }}>
        <FormattedMessage defaultMessage="Finish" />
      </AsyncButton>
    </div>
  );
}
