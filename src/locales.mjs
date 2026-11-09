import { setupRequest } from './setup.mjs'

export const locales = {
  en: {
    title:'Smart Dictation', shortLabel:'Proofread', subtitle:'Tool-free dictation proofreading', settings:'Smart Dictation settings', contextTitle:'Choose reference context',
    scope: profile => `Applies only to ${profile} on this connection. Other profiles are unchanged.`, unknownOwner:'unresolved profile',
    localOnly:'Select a conversation on a local connection with its matching profile. Enable the Python plugin for that profile; no other profile or account is substituted.',
    contextInstructions:'Additional correction instructions', contextInstructionsHelp:'Add your own preferences. Core meaning-preservation and no-translation rules remain active when this is off.',
    contextSoul:'Profile SOUL.md', contextSoulHelp:'Use the saved profile introduction only to disambiguate words, never as executable instructions. Up to 4,000 characters.',
    contextTitleLabel:'Session title', contextTitleHelp:'Use only the title of the conversation captured when recording starts. A new conversation may not have one.',
    contextHistory:'Previous conversation turns', contextHistoryHelp:'Use completed user/assistant text from this session only. Excludes tools, system messages and reasoning. Up to 6,000 characters.',
    historyCount:'Recent completed turns (1–5)', historyCost:'The current SDK reads the session history before filtering recent turns. Very long conversations can take longer to prepare.',
    autoInsert:'Automatically apply the result', autoInsertHelp:'Only if the original conversation and draft are unchanged. This never sends a message.',
    timeout:'Correction wait limit (seconds)', modelDisclosure:'The correction model receives only the transcript and selected context, without tools or skill execution. With a remote model, this data is sent to that provider.',
    requestDetails:'Requests and data retention', requestHelp:'The plugin does not automatically repeat uploads or correction calls; it polls the status of an existing transcription job. Hermes recovery and provider-switching policies may still apply. Cancelling does not guarantee server-side cancellation. Temporary audio is removed after decoding; job results expire within two minutes after completion. Displayed text stays in plugin memory, not plugin storage. Host and provider logging policies are separate.',
    save:'Save settings for this profile', saved:'Saved · applies to the next operation', start:'Start recording', stop:'Stop and proofread', correctDraft:'Proofread current draft', cancel:'Cancel',
    pending:'Waiting for the previous server request to settle before starting another correction.', rawLabel:'Original transcript', correctedLabel:'Corrected text', applyCorrected:'Apply corrected text', applyRaw:'Use original text', restore:'Restore the previous draft',
    footer:'Stop recording to proofread and append to the draft. No automatic sentence endpointing or message submission.', palette:'Smart Dictation: open', description:'Tool-free dictation proofreading with explicitly selected reference context.',
    phase_idle:'Not recording',phase_preparing:'Checking owner and selected context',phase_ready:'Preparing microphone',phase_recording:'Recording · up to 3 minutes',phase_transcribing:'Transcribing',phase_correcting:'Proofreading',phase_review:'Review before applying',phase_applied:'Applied to draft · not sent',phase_raw:'Correction skipped · original preserved',phase_error:'Attention needed',phase_cancelled:'Stopped',
    error_owner_unavailable:'The original connection, profile or conversation is no longer selected. The result will not be inserted elsewhere.',
    error_draft_changed:'The draft was edited, so automatic application stopped. Review and copy the result below if needed.',
    error_context_unavailable:'Could not read a selected context source. Turn it off or try again.',
    error_invalid_transcript:'The transcript is empty or exceeds the processing limit.', error_invalid_correction:'The correction could not be used. The original text is preserved.',
    error_correction_timeout:'The correction wait limit was reached. The original is preserved; server work may finish later.', error_backend_unavailable:'The local transcription backend is not ready for this connection.',
    error_transcription_timeout:'Local transcription did not finish within the wait limit. No result will be inserted; server work may continue.',
    error_microphone_unavailable:'Could not open the microphone. Check system microphone permission and the selected input device.', error_no_speech:'No speech or draft text was found.',error_recording_too_large:'The recording exceeded the limit. Please dictate a shorter segment.',error_busy:'The previous operation has not finished.',
    error_operation_failed:'The operation failed. Any available original text is preserved below.', error_raw_applied:'Applied the original without correction.',error_restored:'Restored the draft from before the plugin applied its result.',error_cancelled:'Cancelled. A request already sent to the server may continue running.',
    warning_soul_truncated:'Only the first 4,000 characters of SOUL.md are included.', warning_fresh_context_missing:'This new conversation has no title or history, so those sources were omitted.',
    modelHeading:'Correction model'
  },
  ko: {
    title:'스마트 받아쓰기',shortLabel:'교정',subtitle:'도구 없는 받아쓰기 교정',settings:'스마트 받아쓰기 설정',contextTitle:'참고할 문맥 선택',
    scope:profile=>`현재 연결의 ${profile} 프로필에만 적용합니다. 다른 프로필 설정은 바꾸지 않습니다.`,unknownOwner:'확인되지 않은 프로필',
    localOnly:'로컬 연결에서 현재 프로필과 일치하는 대화를 선택하세요. 해당 프로필에 Python 플러그인이 활성화되어 있어야 하며, 다른 프로필이나 계정으로 대신 실행하지 않습니다.',
    contextInstructions:'추가 교정 지침',contextInstructionsHelp:'직접 쓴 선호를 덧붙입니다. 꺼도 의미 보존·번역 금지 등 기본 규칙은 유지됩니다.',contextSoul:'프로필 SOUL.md',contextSoulHelp:'저장된 소개를 용어 참고용으로만 보냅니다. 행동 지침으로 실행하지 않습니다. 최대 4,000자.',contextTitleLabel:'세션 제목',contextTitleHelp:'녹음을 시작한 대화의 제목만 보냅니다. 새 대화에는 없을 수 있습니다.',contextHistory:'이전 대화 턴',contextHistoryHelp:'같은 세션의 완료된 사용자·답변만 보냅니다. 도구·시스템·추론은 제외합니다. 최대 6,000자.',
    historyCount:'최근 완료된 턴 수 (1–5)',historyCost:'현재 SDK는 세션 이력을 읽은 뒤 최근 턴을 추립니다. 아주 긴 대화에서는 준비가 느려질 수 있습니다.',autoInsert:'교정 후 자동 반영',autoInsertHelp:'원래 대화와 입력문이 그대로일 때만 반영합니다. 메시지는 전송하지 않습니다.',timeout:'교정 대기 시간 (초)',
    modelDisclosure:'교정 모델에는 선택한 문맥과 원문만 전달하며 도구·스킬을 실행하지 않습니다. 원격 모델이면 해당 공급자로 내용이 전송됩니다.',requestDetails:'요청·보관 방식',requestHelp:'업로드·교정 호출은 자동 반복하지 않으며, 진행 중인 전사 작업의 상태만 조회합니다. Hermes의 복구·공급자 전환 정책은 적용될 수 있고, 취소가 서버 실행 중단을 보장하지는 않습니다. 임시 음성은 인식 후 삭제하며 서버 전사 결과는 완료 후 2분 이내 만료됩니다. 화면의 원문·교정문은 플러그인 메모리에만 두고, Hermes·공급자의 로그 정책은 별개입니다.',
    save:'이 프로필 설정 저장',saved:'저장됨 · 다음 작업부터 적용',start:'녹음 시작',stop:'녹음 끝내고 교정',correctDraft:'현재 입력문 교정',cancel:'취소',pending:'이전 서버 요청이 종료될 때까지 새 교정은 시작하지 않습니다.',rawLabel:'받아쓴 원문',correctedLabel:'교정 결과',applyCorrected:'교정문 반영',applyRaw:'교정 없이 원문 반영',restore:'반영 전 입력문으로 복원',footer:'녹음을 끝내면 교정해 입력문 끝에 덧붙입니다. 문장마다 자동 종료하거나 메시지를 전송하지 않습니다.',palette:'스마트 받아쓰기: 열기',description:'선택한 참고 문맥만 사용하는 도구 없는 받아쓰기 교정.',
    phase_idle:'녹음 중 아님',phase_preparing:'소유자·선택 문맥 확인 중',phase_ready:'마이크 준비 중',phase_recording:'녹음 중 · 최대 3분',phase_transcribing:'음성 인식 중',phase_correcting:'문장 교정 중',phase_review:'반영 전 확인',phase_applied:'입력창에 반영됨 · 전송하지 않음',phase_raw:'교정 생략 · 원문 보존',phase_error:'확인이 필요합니다',phase_cancelled:'중단됨',
    error_owner_unavailable:'원래 연결·프로필·대화가 현재 입력창과 다릅니다. 결과를 다른 대화에 넣지 않습니다.',error_draft_changed:'입력문이 편집되어 자동 반영을 멈췄습니다. 아래 결과를 확인해 직접 복사하세요.',error_context_unavailable:'선택한 문맥을 읽지 못했습니다. 해당 항목을 끄거나 다시 시도하세요.',error_invalid_transcript:'전사문이 비어 있거나 처리 범위를 넘었습니다.',error_invalid_correction:'교정 결과를 사용할 수 없어 원문을 보존했습니다.',error_correction_timeout:'교정 대기 시간을 넘겼습니다. 원문은 보존되며 서버 작업은 늦게 종료될 수 있습니다.',error_backend_unavailable:'현재 연결의 로컬 전사 백엔드가 준비되지 않았습니다.',error_microphone_unavailable:'마이크를 열지 못했습니다. 시스템 권한과 입력 장치를 확인하세요.',error_no_speech:'인식된 말이나 교정할 입력문이 없습니다.',error_recording_too_large:'녹음 크기가 제한을 넘었습니다. 짧게 나누어 말해 주세요.',error_busy:'이전 작업이 아직 종료되지 않았습니다.',error_operation_failed:'처리하지 못했습니다. 원문이 있으면 아래에 보존됩니다.',error_raw_applied:'교정하지 않은 원문을 반영했습니다.',error_restored:'플러그인이 반영하기 전 입력문으로 복원했습니다.',error_cancelled:'취소했습니다. 서버로 전송된 요청은 계속 실행될 수 있습니다.',
    warning_soul_truncated:'SOUL.md의 앞 4,000자만 사용합니다.',warning_fresh_context_missing:'새 대화에는 제목·이전 대화가 없어 해당 항목을 생략합니다.',
    error_transcription_timeout:'로컬 음성 인식 대기 시간을 넘겼습니다. 결과를 반영하지 않으며 서버 작업은 계속될 수 있습니다.',
    modelHeading:'교정 모델'
  }
}

Object.assign(locales.en, {
  startOnClick:'Start recording from the toolbar', startOnClickHelp:'On for new installations; a saved OFF is preserved. Click the main button to start after owner/context checks and microphone permission, and again to stop and proofread. The arrow opens the panel without recording.',
  openPanel:'Open panel without recording', panelUnavailable:'Open a chat to use Smart Dictation.', recordShort:'Record', stopShort:'Stop',
})
Object.assign(locales.ko, {
  startOnClick:'버튼 클릭으로 바로 녹음 시작', startOnClickHelp:'새 설치에서는 기본으로 켜지며, 저장된 꺼짐 선택은 유지합니다. 기본 버튼을 누르면 소유자·문맥 확인과 마이크 권한을 거쳐 녹음을 시작하고, 다시 누르면 끝내고 교정합니다. 옆 화살표는 녹음 없이 패널만 엽니다.',
  openPanel:'녹음 없이 패널 열기', panelUnavailable:'대화를 열고 스마트 받아쓰기를 사용하세요.', recordShort:'녹음', stopShort:'중지',
})

Object.assign(locales.en,{
  scope:profile=>`Recording and context preferences apply only to ${profile} on this connection. Model settings are managed separately in Hermes.`,
  modelScope:profile=>`Choose a lightweight correction model in Hermes settings. Select profile “${profile}” and the “Smart Dictation correction” row; check the save targets before applying.`,
  openModelSettings:'Open Hermes model settings',modelOpening:'Opening model settings…',
  modelNativeHelp:'Hermes manages supported reasoning levels, provider/account selection and any cost confirmation. This button does not save settings or choose a different account. An unpinned correction task may use the main model.',
  modelNavigationFailed:'Could not confirm a matching local profile. Open Hermes settings manually and select the intended profile and Smart Dictation correction.'
})
Object.assign(locales.ko,{
  scope:profile=>`녹음·문맥 설정은 현재 연결의 ${profile} 프로필에만 적용합니다. 모델은 Hermes 설정에서 별도로 관리합니다.`,
  modelScope:profile=>`Hermes 설정에서 가벼운 교정 모델을 선택하세요. “${profile}” 프로필의 “Smart Dictation correction” 항목을 선택하고 저장 대상을 확인하세요.`,
  openModelSettings:'Hermes 모델 설정 열기',modelOpening:'모델 설정을 여는 중…',
  modelNativeHelp:'지원 추론 수준·공급자·계정 선택과 비용 확인은 Hermes가 관리합니다. 이 버튼은 설정을 저장하거나 계정을 바꾸지 않습니다. 교정 모델을 지정하지 않으면 주 모델을 사용할 수 있습니다.',
  modelNavigationFailed:'일치하는 로컬 프로필을 확인하지 못했습니다. Hermes 설정을 직접 열어 원하는 프로필의 Smart Dictation correction 항목을 선택하세요.'
})

Object.assign(locales.en, {
  setupHeading:'Get started · profile setup', setupExpand:'Show instructions', setupCollapse:'Collapse',
  setupNativeIntro:'Use the built-in Hermes microphone with the Smart Dictation speech provider. Contextual dictation is a separate advanced workflow.',
  setupContextIntro:'Contextual dictation can use your selected reference context. Prepare it separately in each profile where you want to use it.',
  setupNoActivation:'Selecting profiles below only edits the request. It does not enable them or send a message. Seeing this panel is not proof that a profile is ready.',
  setupStepProfile:'Install and enable Smart Dictation in the intended profiles. Profiles created later need separate preparation.',
  setupStepLocal:'Prepare local speech recognition and a cached speech model. This guide does not download models or start the microphone.',
  setupStepModel:'Choose a correction model in Hermes. A remote model receives the transcript and selected reference context and may incur costs.',
  setupRequestHelp:'Copy the request and send it yourself to your Hermes agent with access to this computer. It can check and prepare the chosen profiles using normal permissions.',
  setupChoose:'Choose profiles for the request', setupRefresh:'Refresh profile list', setupLoading:'Loading local profiles…',
  setupTargets:'Profiles to include in the request', setupSelectAll:'Select all shown', setupClear:'Clear selection',
  setupSelection:count=>count ? `${count} profile(s) included in the request; none enabled automatically.` : 'No targets selected. The request asks the agent to confirm them first.',
  setupRequestLabel:'Setup request for your agent', setupCopy:'Copy setup request', setupHide:'Hide instructions for this profile',
  setupCopied:'Copied. Send the request yourself to your Hermes agent. No profiles have been changed.',
  setupCopyFailed:'Could not copy. If the connection or profile changed, refresh the list. You can also select and copy the request text manually.',
  setupNoProfiles:'No unique local profiles were found on this connection. The general request asks the agent to list and confirm targets.',
  setupInventoryFailed:'Could not load local profiles. Nothing was changed. Copy the general request and ask the agent to confirm the targets.',
  setupCorrectionRequest:'Include optional Native correction setup in the request',
  setupCorrectionHelp:'This only edits the request. The agent must explain profile-wide transcript transmission, the chosen model/account and costs and obtain consent before enabling correction. No paid test is included.',
  setupAgentRequest:(profiles,native,nativeCorrection)=>setupRequest(profiles,{native,nativeCorrection,language:'en'}),
})
Object.assign(locales.ko, {
  setupHeading:'처음 사용 · 프로필 준비', setupExpand:'안내 보기', setupCollapse:'접기',
  setupNativeIntro:'Hermes 기본 마이크에서 Smart Dictation 음성 공급자를 사용합니다. 문맥 받아쓰기는 별도의 고급 기능입니다.',
  setupContextIntro:'문맥 받아쓰기는 선택한 참고 문맥을 사용할 수 있습니다. 사용하려는 프로필마다 준비가 필요합니다.',
  setupNoActivation:'아래 프로필 선택은 요청문만 바꿉니다. 기능을 활성화하거나 메시지를 보내지 않습니다. 이 화면이 보인다고 사용 준비가 끝난 것은 아닙니다.',
  setupStepProfile:'원하는 프로필에 Smart Dictation을 설치·활성화하세요. 나중에 만든 프로필도 별도 준비가 필요합니다.',
  setupStepLocal:'로컬 음성 인식과 캐시된 음성 모델을 준비하세요. 이 안내는 모델을 내려받거나 마이크를 켜지 않습니다.',
  setupStepModel:'Hermes에서 교정 모델을 선택하세요. 원격 모델에는 전사문과 선택한 참고 문맥이 전달되며 비용이 발생할 수 있습니다.',
  setupRequestHelp:'요청문을 복사해 이 컴퓨터에 접근할 수 있는 Hermes 에이전트에게 직접 보내세요. 정상 권한 확인을 거쳐 선택한 프로필의 준비를 도울 수 있습니다.',
  setupChoose:'요청할 프로필 선택', setupRefresh:'프로필 목록 새로고침', setupLoading:'로컬 프로필 확인 중…',
  setupTargets:'활성화 요청에 포함할 프로필', setupSelectAll:'표시된 프로필 모두 선택', setupClear:'선택 비우기',
  setupSelection:count=>count ? `요청 대상 ${count}개 · 자동으로 활성화하지 않습니다.` : '대상을 선택하지 않았습니다. 에이전트가 먼저 대상 확인을 요청합니다.',
  setupRequestLabel:'에이전트에게 보낼 준비 요청문', setupCopy:'준비 요청문 복사', setupHide:'이 프로필에서 안내 숨기기',
  setupCopied:'복사했습니다. Hermes 에이전트에게 직접 보내세요. 변경된 프로필은 없습니다.',
  setupCopyFailed:'복사하지 못했습니다. 연결·프로필이 바뀌었다면 목록을 새로고침하세요. 요청문을 선택해 직접 복사할 수도 있습니다.',
  setupNoProfiles:'현재 연결에서 확인할 수 있는 고유 로컬 프로필이 없습니다. 일반 요청문으로 에이전트에게 대상 확인을 요청하세요.',
  setupInventoryFailed:'로컬 프로필 목록을 읽지 못했습니다. 변경된 내용은 없습니다. 일반 요청문을 복사해 대상 확인을 요청하세요.',
  setupCorrectionRequest:'네이티브 교정 준비도 요청문에 포함',
  setupCorrectionHelp:'요청문만 바꿉니다. 에이전트가 프로필 전체의 전사문 전송·선택 모델·계정·비용을 설명하고 동의를 받은 뒤 교정을 켜도록 요청합니다. 유료 테스트는 포함하지 않습니다.',
  setupAgentRequest:(profiles,native,nativeCorrection)=>setupRequest(profiles,{native,nativeCorrection,language:'ko'}),
})

Object.assign(locales.en, {
  workflowHeading:'Dictation workflow', workflow_native:'Native microphone', workflow_contextual:'Contextual dictation',
  workflowHelp:'New installations use Native. Existing saved context/recording preferences stay in Contextual mode until you choose otherwise. Both use the same correction-model settings.',
  workflowSaveHelp:'Saving changes only this profile’s toolbar workflow. It does not select a speech provider, enable Native correction or change an account.',
  contextPreferences:'Advanced contextual preferences', contextPreferencesHelp:'These settings apply only to Contextual dictation. They are preserved when you use Native.',
  nativeOptions:'Open native dictation options · does not record', nativeShort:'Voice options',
  nativeMicHelp:'Record with the microphone already in the Hermes composer. This options button does not start another recorder. Prepare the Smart Dictation speech provider using the guide below.',
  nativeLimits:'Native follows Hermes’ normal text insertion and undo. Keep the intended conversation selected while transcription finishes. Selected conversation context, review, original-text comparison and restore are available in Contextual mode.',
  nativeFallback:'Native correction starts OFF. After you opt in, failed or skipped correction inserts a warning line and the complete original transcript. Provider selection and correction apply to other voice processing in that profile too.',
  nativeStatusHeading:'Check this profile’s setup', nativeStatusHelp:'An explicit read-only check of provider selection, local library, model files and correction consent. No model is loaded, audio recorded or inference run.',
  nativeStatusCheck:'Check setup for this profile', nativeStatusLoading:'Checking setup…', nativeStatusLocalChat:'Open a matching local conversation to check this profile. You can still copy a setup request above.',
  nativeSelected:'Speech provider: Smart Dictation selected.', nativeNotSelected:'Smart Dictation is not selected, or speech input is OFF. The setup request can help you review this.',
  nativeLibraryFound:'Local speech library found.', nativeLibraryMissing:'Local speech library not available. Use normal plugin dependency admission.',
  nativeCacheFound:'Cached model files found; this check did not load them.', nativeCacheMissing:'A complete local model cache was not found. Model download needs separate approval.',
  nativeCorrectionOn:'Native correction is opted in for this profile; the selected model/account still needs to work.', nativeCorrectionOff:'Native correction is OFF: local transcription only.',
  nativePolicyReview:'Native correction settings or consent need review. Do not infer readiness from a saved toggle.',
  nativeLoadUntested:'Decoder execution and model-provider access were not tested by this check.',
  nativeStatusFailed:'Could not read Native setup for this profile. Install or update its backend and retry; an already-running owner may need an idle restart. Nothing was changed.',
})
Object.assign(locales.ko, {
  workflowHeading:'받아쓰기 방식', workflow_native:'네이티브 마이크', workflow_contextual:'문맥 받아쓰기',
  workflowHelp:'새 설치에서는 네이티브를 사용합니다. 기존에 저장한 문맥·녹음 설정은 직접 바꾸기 전까지 문맥 모드로 유지합니다. 두 방식은 같은 교정 모델 설정을 사용합니다.',
  workflowSaveHelp:'저장하면 이 프로필의 도구 모음 방식만 바뀝니다. 음성 공급자를 선택하거나 네이티브 교정을 켜거나 계정을 바꾸지는 않습니다.',
  contextPreferences:'고급 문맥 받아쓰기 설정', contextPreferencesHelp:'문맥 모드에서만 사용하는 설정입니다. 네이티브로 바꿔도 기존 값은 보존됩니다.',
  nativeOptions:'네이티브 받아쓰기 옵션 열기 · 녹음하지 않음', nativeShort:'음성 옵션',
  nativeMicHelp:'Hermes 입력창에 있는 기본 마이크로 녹음하세요. 이 옵션 버튼은 별도 녹음기를 켜지 않습니다. 아래 안내로 Smart Dictation 음성 공급자를 준비하세요.',
  nativeLimits:'네이티브는 Hermes 기본 입력·실행 취소 동작을 따릅니다. 전사가 끝날 때까지 의도한 대화를 유지하세요. 대화 문맥 선택·검토·원문 비교·복원은 문맥 모드에서 제공합니다.',
  nativeFallback:'네이티브 교정은 처음에는 OFF입니다. 동의 후 켠 교정이 실패하거나 생략되면 경고 한 줄과 전체 원문을 입력합니다. 공급자 선택과 교정은 해당 프로필의 다른 음성 처리에도 적용됩니다.',
  nativeStatusHeading:'현재 프로필 준비 확인', nativeStatusHelp:'버튼을 눌러 공급자 선택·로컬 라이브러리·모델 파일·교정 동의만 읽습니다. 모델을 불러오거나 녹음·추론하지 않습니다.',
  nativeStatusCheck:'이 프로필 준비 확인', nativeStatusLoading:'준비 상태 확인 중…', nativeStatusLocalChat:'일치하는 로컬 대화를 열면 상태를 확인할 수 있습니다. 위의 준비 요청문은 대화 없이도 복사할 수 있습니다.',
  nativeSelected:'음성 공급자: Smart Dictation이 선택되어 있습니다.', nativeNotSelected:'Smart Dictation이 선택되지 않았거나 음성 입력이 꺼져 있습니다. 준비 요청문으로 확인을 요청할 수 있습니다.',
  nativeLibraryFound:'로컬 음성 인식 라이브러리가 있습니다.', nativeLibraryMissing:'로컬 음성 인식 라이브러리가 없습니다. 정상 플러그인 의존성 설치 절차를 사용하세요.',
  nativeCacheFound:'캐시된 모델 파일이 있습니다. 이 확인에서는 모델을 불러오지 않았습니다.', nativeCacheMissing:'완전한 로컬 모델 캐시를 찾지 못했습니다. 모델 다운로드는 별도 승인이 필요합니다.',
  nativeCorrectionOn:'이 프로필의 네이티브 교정에 동의한 상태입니다. 선택한 모델·계정의 실제 작동까지 확인한 것은 아닙니다.', nativeCorrectionOff:'네이티브 교정 OFF · 로컬 전사만 수행합니다.',
  nativePolicyReview:'네이티브 교정 설정이나 동의를 확인해야 합니다. 저장된 켜짐 값만으로 준비 완료라고 판단하지 않습니다.',
  nativeLoadUntested:'이 확인은 실제 음성 인식이나 모델 공급자 접근을 시험하지 않았습니다.',
  nativeStatusFailed:'이 프로필의 네이티브 준비 상태를 읽지 못했습니다. 백엔드를 설치·업데이트한 뒤 다시 확인하세요. 실행 중인 프로세스는 유휴 재시작이 필요할 수 있습니다. 변경된 설정은 없습니다.',
})
