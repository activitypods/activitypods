export type ModerationAction = 'label' | 'warn' | 'filter' | 'block' | 'suspend';

export type ModerationDecision = {
  id: string;
  appliedAt: string;
  appliedBy: string;
  action: ModerationAction;
  labels: string[];
  targetWebId?: string;
  targetActorUri?: string;
  targetAtDid?: string;
  targetHandle?: string;
  sourceCaseId?: string;
  reason?: string;
  protocols?: 'none' | 'ap' | 'at' | 'both';
  mrfPatched?: boolean;
  atLabelEmitted?: boolean;
  atStatusUpdated?: boolean;
  revoked?: boolean;
};

export type ModerationCase = {
  id: string;
  activityId?: string;
  source: 'activitypub-flag' | 'local-user-report';
  protocol: 'ap' | 'activitypods';
  reporter?: {
    canonicalAccountId?: string;
    did?: string;
    webId?: string;
    activityPubActorUri?: string;
    handle?: string;
  } | null;
  recipient?: {
    webId?: string;
    activityPubActorUri?: string;
  } | null;
  inboxPath?: string;
  reasonType: 'spam' | 'harassment' | 'abuse' | 'impersonation' | 'copyright' | 'illegal' | 'safety' | 'other';
  reason?: string;
  requestedForwarding?: { remote: boolean } | null;
  clientContext?: { app?: string | null; surface?: string | null } | null;
  subject:
    | {
        kind: 'account';
        authoritativeProtocol?: 'local' | 'ap' | 'at';
        actor: {
          canonicalAccountId?: string;
          did?: string;
          webId?: string;
          activityPubActorUri?: string;
          handle?: string;
        };
      }
    | {
        kind: 'object';
        authoritativeProtocol?: 'local' | 'ap' | 'at';
        object: {
          canonicalObjectId: string;
          atUri?: string;
          cid?: string;
          activityPubObjectId?: string;
          canonicalUrl?: string;
        };
        owner?: {
          canonicalAccountId?: string;
          did?: string;
          webId?: string;
          activityPubActorUri?: string;
          handle?: string;
        } | null;
      };
  evidenceObjectRefs: Array<{
    canonicalObjectId: string;
    atUri?: string;
    cid?: string;
    activityPubObjectId?: string;
    canonicalUrl?: string;
  }>;
  receivedAt: string;
  createdAt?: string;
  status: 'open' | 'resolved' | 'dismissed';
  relatedDecisionIds: string[];
  canonicalEvent?: {
    status: 'pending' | 'published' | 'failed';
    canonicalIntentId?: string;
    lastAttemptAt?: string;
    publishedAt?: string;
    lastError?: string;
  };
  forwarding?: {
    activityPub?: {
      status: 'pending' | 'queued' | 'delivered' | 'failed' | 'skipped';
      canonicalIntentId?: string;
      moderationActorUri?: string;
      activityId?: string;
      outboxIntentId?: string;
      targetActorUri?: string;
      targetInbox?: string;
      targetDomain?: string;
      lastAttemptAt?: string;
      queuedAt?: string;
      deliveredAt?: string;
      lastError?: string;
      skippedReason?: string;
      lastStatusCode?: number;
    } | null;
    atproto?: {
      status: 'pending' | 'delivered' | 'failed' | 'skipped';
      canonicalIntentId?: string;
      serviceDid?: string;
      pdsUrl?: string;
      reporterDid?: string;
      reporterHandle?: string;
      subjectDid?: string;
      subjectAtUri?: string;
      reportId?: number;
      lastAttemptAt?: string;
      deliveredAt?: string;
      lastError?: string;
      skippedReason?: string;
      lastStatusCode?: number;
    } | null;
  } | null;
  updatedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
};

export type ModerationChipColor = 'default' | 'success' | 'info' | 'warning' | 'error';

export type ForwardingBadge = {
  key: string;
  label: string;
  color: ModerationChipColor;
};

export type ForwardingProtocol = 'activityPub' | 'atproto';

export type CaseForwardingControl = {
  protocol: ForwardingProtocol;
  label: string;
  enableRemoteForwarding?: boolean;
};

const firstNonEmpty = (...values: Array<string | undefined | null>) =>
  values.find(value => Boolean(value && value.trim()));

export const protocolColor = (protocols: ModerationDecision['protocols']): ModerationChipColor => {
  switch (protocols) {
    case 'both':
      return 'success';
    case 'ap':
    case 'at':
      return 'info';
    default:
      return 'default';
  }
};

export const caseStatusColor = (status: ModerationCase['status']): ModerationChipColor => {
  switch (status) {
    case 'resolved':
      return 'success';
    case 'dismissed':
      return 'warning';
    default:
      return 'default';
  }
};

export const describeCaseSource = (entry: ModerationCase) =>
  entry.source === 'activitypub-flag' ? 'Inbound ActivityPub Flag' : 'Local user report';

export const caseSubjectKindLabel = (entry: ModerationCase) =>
  entry.subject.kind === 'account' ? 'Account report' : 'Object report';

export const caseAuthorityLabel = (entry: ModerationCase) => {
  switch (entry.subject.authoritativeProtocol) {
    case 'ap':
      return 'Authority: ActivityPub';
    case 'at':
      return 'Authority: AT Protocol';
    default:
      return 'Authority: Local';
  }
};

export const caseReporterLines = (entry: ModerationCase) => {
  const primary = firstNonEmpty(
    entry.reporter?.webId,
    entry.reporter?.activityPubActorUri,
    entry.reporter?.did,
    entry.reporter?.handle
  );
  const secondary = firstNonEmpty(
    entry.reporter?.activityPubActorUri && entry.reporter.activityPubActorUri !== primary
      ? entry.reporter.activityPubActorUri
      : null,
    entry.reporter?.did && entry.reporter.did !== primary ? entry.reporter.did : null,
    entry.reporter?.handle && entry.reporter.handle !== primary ? entry.reporter.handle : null
  );
  const lines = [primary, secondary].filter((value): value is string => Boolean(value));
  return lines.length > 0 ? lines : ['Unknown reporter'];
};

export const caseTargetLines = (entry: ModerationCase) => {
  if (entry.subject.kind === 'account') {
    return [
      firstNonEmpty(
        entry.subject.actor.webId,
        entry.subject.actor.activityPubActorUri,
        entry.subject.actor.did,
        entry.subject.actor.handle
      )
    ].filter((value): value is string => Boolean(value));
  }

  const primaryObject =
    firstNonEmpty(
      entry.subject.object.canonicalUrl,
      entry.subject.object.activityPubObjectId,
      entry.subject.object.atUri,
      entry.subject.object.canonicalObjectId
    ) || entry.subject.object.canonicalObjectId;
  const owner =
    firstNonEmpty(
      entry.subject.owner?.webId,
      entry.subject.owner?.activityPubActorUri,
      entry.subject.owner?.did,
      entry.subject.owner?.handle
    ) || null;
  return [
    primaryObject,
    owner,
    ...entry.evidenceObjectRefs
      .slice(0, 2)
      .map(ref => firstNonEmpty(ref.canonicalUrl, ref.activityPubObjectId, ref.atUri, ref.canonicalObjectId))
      .filter((value): value is string => Boolean(value))
  ].filter((value): value is string => Boolean(value));
};

export const caseForwardingBadges = (entry: ModerationCase): ForwardingBadge[] => {
  const badges: ForwardingBadge[] = [];

  if (entry.canonicalEvent?.status) {
    badges.push({
      key: `${entry.id}-canonical`,
      label: `Canonical ${entry.canonicalEvent.status}`,
      color:
        entry.canonicalEvent.status === 'published'
          ? 'success'
          : entry.canonicalEvent.status === 'failed'
            ? 'error'
            : 'warning'
    });
  }

  if (entry.forwarding?.activityPub?.status) {
    const status = entry.forwarding.activityPub.status;
    badges.push({
      key: `${entry.id}-activitypub`,
      label: `AP ${status}`,
      color:
        status === 'delivered' ? 'success' : status === 'failed' ? 'error' : status === 'skipped' ? 'warning' : 'info'
    });
  }

  if (entry.forwarding?.atproto?.status) {
    const status = entry.forwarding.atproto.status;
    badges.push({
      key: `${entry.id}-atproto`,
      label: `AT ${status}`,
      color:
        status === 'delivered' ? 'success' : status === 'failed' ? 'error' : status === 'skipped' ? 'warning' : 'info'
    });
  }

  return badges;
};

export const caseForwardingNotes = (entry: ModerationCase) => {
  const notes = new Set<string>();

  if (entry.canonicalEvent?.lastError) {
    notes.add(`Canonical: ${entry.canonicalEvent.lastError}`);
  }
  if (entry.forwarding?.activityPub?.skippedReason) {
    notes.add(`AP skip: ${entry.forwarding.activityPub.skippedReason}`);
  }
  if (entry.forwarding?.activityPub?.lastError) {
    notes.add(`AP error: ${entry.forwarding.activityPub.lastError}`);
  }
  if (entry.forwarding?.atproto?.skippedReason) {
    notes.add(`AT skip: ${entry.forwarding.atproto.skippedReason}`);
  }
  if (entry.forwarding?.atproto?.lastError) {
    notes.add(`AT error: ${entry.forwarding.atproto.lastError}`);
  }

  return [...notes];
};

export const caseForwardingControl = (entry: ModerationCase): CaseForwardingControl | null => {
  if (entry.source !== 'local-user-report' || entry.status === 'dismissed') {
    return null;
  }

  if (entry.subject.authoritativeProtocol === 'ap') {
    const state = entry.forwarding?.activityPub;
    if (state?.status === 'pending' || state?.status === 'queued' || state?.status === 'delivered') {
      return null;
    }
    return {
      protocol: 'activityPub',
      label: entry.requestedForwarding?.remote ? 'Retry AP forward' : 'Forward to AP',
      enableRemoteForwarding: !entry.requestedForwarding?.remote
    };
  }

  if (entry.subject.authoritativeProtocol === 'at') {
    const state = entry.forwarding?.atproto;
    if (state?.status === 'pending' || state?.status === 'delivered') {
      return null;
    }
    return {
      protocol: 'atproto',
      label: entry.requestedForwarding?.remote ? 'Retry AT forward' : 'Forward to AT',
      enableRemoteForwarding: !entry.requestedForwarding?.remote
    };
  }

  return null;
};

export const decisionEnforcementLines = (decision: ModerationDecision) => {
  const lines = [];

  if (decision.mrfPatched) {
    lines.push('AP subject rule applied');
  }
  if (decision.atLabelEmitted) {
    lines.push('AT label emitted');
  }
  if (decision.atStatusUpdated) {
    lines.push('AT account status updated');
  }
  if (lines.length === 0) {
    lines.push(
      decision.protocols && decision.protocols !== 'none' ? 'Protocol propagation recorded' : 'No enforcement'
    );
  }

  return lines;
};
