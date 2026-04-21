import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PublicIcon from '@mui/icons-material/Public';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import copy from 'copy-to-clipboard';
import React, { useCallback, useEffect, useState } from 'react';
import { useNotify } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from './dashboardApi';

type ListKind = 'mutes' | 'blocks';
type SubjectProtocol = 'ap' | 'atproto';

type LdpResource = { '@id': string };

type ModerationSubject = LdpResource & {
  subjectCanonicalId: string;
  subjectProtocol: string;
};

type SharingState = {
  public: boolean;
  collectionUri: string;
  followersCollectionUri: string | null;
};

type ListDraftState = Record<ListKind, { subject: string; protocol: SubjectProtocol; search: string }>;

type PendingVisibilityAction = {
  kind: ListKind;
  nextPublic: boolean;
} | null;

const PROTOCOL_OPTIONS: Array<{ value: SubjectProtocol; label: string }> = [
  { value: 'ap', label: 'ActivityPub' },
  { value: 'atproto', label: 'ATProto/Bluesky' }
];

const LIST_META: Record<
  ListKind,
  {
    title: string;
    emptyText: string;
    description: string;
    privateNotice: string;
    publicNotice: string;
    publishLabel: string;
    unpublishLabel: string;
  }
> = {
  mutes: {
    title: 'Muted accounts',
    emptyText: 'No muted accounts yet.',
    description:
      'Manage direct account mutes as a first-class list. Muted accounts disappear from your feed, but can still see your public activity.',
    privateNotice:
      'Muted accounts stay private by default. If you publish this list, it becomes a followable ActivityPub collection.',
    publicNotice:
      'This mute list is public and followable over ActivityPub. Anyone with the URL can inspect or subscribe to it.',
    publishLabel: 'Make list public',
    unpublishLabel: 'Make list private'
  },
  blocks: {
    title: 'Blocked accounts',
    emptyText: 'No blocked accounts yet.',
    description:
      'Manage direct account blocks as a first-class list. Blocks prevent interaction and hide the account from your logged-in experience.',
    privateNotice:
      'Blocked accounts stay private by default in Memory. Publishing is opt-in, even though ATProto blocks themselves are public records.',
    publicNotice:
      'This block list is public and followable over ActivityPub. Publish carefully, because it may reveal sensitive safety decisions.',
    publishLabel: 'Make list public',
    unpublishLabel: 'Make list private'
  }
};

const initialDraftState: ListDraftState = {
  mutes: { subject: '', protocol: 'ap', search: '' },
  blocks: { subject: '', protocol: 'ap', search: '' }
};

const normalizeSharingState = (value: any): SharingState => ({
  public: value?.public === true,
  collectionUri: typeof value?.collectionUri === 'string' ? value.collectionUri : '',
  followersCollectionUri: typeof value?.followersCollectionUri === 'string' ? value.followersCollectionUri : null
});

const resourceUri = (item: LdpResource) => item['@id'];

function useModerationSubjects(container: ListKind) {
  const [items, setItems] = useState<ModerationSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dashboardApi.list(container);
      setItems((result?.data || []) as ModerationSubject[]);
    } catch (e: any) {
      setError(e?.message || `Failed to load ${container}.`);
    } finally {
      setLoading(false);
    }
  }, [container]);

  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(
    async (data: Omit<ModerationSubject, '@id'>) => {
      setSaving(true);
      setError(null);
      try {
        await dashboardApi.create(container, data);
        await load();
      } catch (e: any) {
        setError(e?.message || `Failed to update ${container}.`);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [container, load]
  );

  const remove = useCallback(
    async (uri: string) => {
      setSaving(true);
      setError(null);
      try {
        await dashboardApi.remove(uri);
        await load();
      } catch (e: any) {
        setError(e?.message || `Failed to update ${container}.`);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [container, load]
  );

  return { items, loading, saving, error, add, remove, reload: load };
}

const ModerationListsPage = () => {
  useCheckAuthenticated();

  const navigate = useNavigate();
  const notify = useNotify();

  const mutedList = useModerationSubjects('mutes');
  const blockedList = useModerationSubjects('blocks');

  const [activeTab, setActiveTab] = useState(0);
  const [drafts, setDrafts] = useState<ListDraftState>(initialDraftState);
  const [mutedSharingState, setMutedSharingState] = useState<SharingState | null>(null);
  const [blockedSharingState, setBlockedSharingState] = useState<SharingState | null>(null);
  const [sharingLoading, setSharingLoading] = useState(true);
  const [sharingError, setSharingError] = useState<string | null>(null);
  const [sharingSaveTarget, setSharingSaveTarget] = useState<ListKind | null>(null);
  const [pendingVisibilityAction, setPendingVisibilityAction] = useState<PendingVisibilityAction>(null);

  const loadSharingState = useCallback(async () => {
    setSharingLoading(true);
    setSharingError(null);
    try {
      const [muted, blocked] = await Promise.all([
        dashboardApi.getMutedListVisibility(),
        dashboardApi.getBlockedListVisibility()
      ]);

      setMutedSharingState(normalizeSharingState(muted));
      setBlockedSharingState(normalizeSharingState(blocked));
    } catch (e: any) {
      setSharingError(e?.message || 'Failed to load list sharing settings.');
    } finally {
      setSharingLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSharingState();
  }, [loadSharingState]);

  const updateDraft = useCallback((kind: ListKind, patch: Partial<ListDraftState[ListKind]>) => {
    setDrafts(prev => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        ...patch
      }
    }));
  }, []);

  const copyValue = useCallback(
    (label: string, value: string | null | undefined) => {
      if (!value) return;
      copy(value);
      notify(`${label} copied.`, { type: 'success' });
    },
    [notify]
  );

  const handleAddSubject = useCallback(
    async (kind: ListKind) => {
      const draft = drafts[kind];
      const subject = draft.subject.trim();
      if (subject.length === 0) return;

      const target = kind === 'mutes' ? mutedList : blockedList;

      try {
        await target.add({
          subjectCanonicalId: subject,
          subjectProtocol: draft.protocol
        });
        updateDraft(kind, { subject: '' });
        notify(`${LIST_META[kind].title} updated.`, { type: 'success' });
      } catch {
        // The hook already stores the detailed error state for inline rendering.
      }
    },
    [blockedList, drafts, mutedList, notify, updateDraft]
  );

  const handleRemoveSubject = useCallback(
    async (kind: ListKind, uri: string) => {
      const target = kind === 'mutes' ? mutedList : blockedList;
      try {
        await target.remove(uri);
        notify(`${LIST_META[kind].title} updated.`, { type: 'success' });
      } catch {
        // The hook already stores the detailed error state for inline rendering.
      }
    },
    [blockedList, mutedList, notify]
  );

  const confirmVisibilityChange = useCallback(async () => {
    if (!pendingVisibilityAction) return;

    const { kind, nextPublic } = pendingVisibilityAction;
    setSharingSaveTarget(kind);
    setSharingError(null);

    try {
      const result =
        kind === 'mutes'
          ? await dashboardApi.setMutedListVisibility(nextPublic)
          : await dashboardApi.setBlockedListVisibility(nextPublic);

      const normalized = normalizeSharingState(result);
      if (kind === 'mutes') {
        setMutedSharingState(normalized);
      } else {
        setBlockedSharingState(normalized);
      }

      notify(
        nextPublic
          ? `${LIST_META[kind].title} are now public and followable.`
          : `${LIST_META[kind].title} are private again.`,
        { type: 'success' }
      );
      setPendingVisibilityAction(null);
    } catch (e: any) {
      setSharingError(e?.message || 'Failed to update sharing settings.');
    } finally {
      setSharingSaveTarget(null);
    }
  }, [notify, pendingVisibilityAction]);

  const renderListPanel = (kind: ListKind) => {
    const meta = LIST_META[kind];
    const listState = kind === 'mutes' ? mutedList : blockedList;
    const sharingState = kind === 'mutes' ? mutedSharingState : blockedSharingState;
    const draft = drafts[kind];

    const filteredItems = listState.items.filter(item => {
      const query = draft.search.trim().toLowerCase();
      if (query.length === 0) return true;
      return (
        item.subjectCanonicalId.toLowerCase().includes(query) ||
        (item.subjectProtocol || '').toLowerCase().includes(query)
      );
    });

    const protocolCounts = listState.items.reduce(
      (acc, item) => {
        if (item.subjectProtocol === 'atproto') {
          acc.atproto += 1;
        } else {
          acc.ap += 1;
        }
        return acc;
      },
      { ap: 0, atproto: 0 }
    );

    const visibilityChip = sharingState?.public ? (
      <Chip icon={<PublicIcon />} label="Public & followable" color="success" size="small" />
    ) : (
      <Chip label="Private" variant="outlined" size="small" />
    );

    return (
      <Stack spacing={3} mt={3}>
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', lg: 'flex-start' }}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap mb={1}>
                <Typography variant="h6">{meta.title}</Typography>
                {visibilityChip}
                <Chip
                  label={`${listState.items.length} ${listState.items.length === 1 ? 'member' : 'members'}`}
                  variant="outlined"
                  size="small"
                />
                {protocolCounts.ap > 0 && (
                  <Chip label={`${protocolCounts.ap} ActivityPub`} size="small" variant="outlined" />
                )}
                {protocolCounts.atproto > 0 && (
                  <Chip label={`${protocolCounts.atproto} ATProto`} size="small" variant="outlined" />
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary" mb={1}>
                {meta.description}
              </Typography>
              <Alert
                severity={sharingState?.public ? (kind === 'blocks' ? 'warning' : 'success') : 'info'}
                sx={{ mt: 2 }}
              >
                {sharingState?.public ? meta.publicNotice : meta.privateNotice}
              </Alert>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Button
                variant={sharingState?.public ? 'outlined' : 'contained'}
                color={sharingState?.public ? 'warning' : 'primary'}
                disabled={sharingLoading || sharingSaveTarget === kind || sharingState == null}
                onClick={() =>
                  setPendingVisibilityAction({
                    kind,
                    nextPublic: !(sharingState?.public === true)
                  })
                }
              >
                {sharingState?.public ? meta.unpublishLabel : meta.publishLabel}
              </Button>
              {sharingState?.public && sharingState.collectionUri && (
                <Button
                  variant="outlined"
                  startIcon={<ContentCopyIcon />}
                  onClick={() => copyValue('Collection URL', sharingState.collectionUri)}
                >
                  Copy link
                </Button>
              )}
            </Stack>
          </Stack>

          {sharingLoading && <CircularProgress size={20} sx={{ mt: 2 }} />}

          {sharingState?.collectionUri && (
            <Stack spacing={1.5} mt={2}>
              <TextField
                size="small"
                fullWidth
                label="Collection URL"
                value={sharingState.collectionUri}
                InputProps={{ readOnly: true }}
              />
              {sharingState.followersCollectionUri && (
                <TextField
                  size="small"
                  fullWidth
                  label="Followers collection URL"
                  value={sharingState.followersCollectionUri}
                  InputProps={{ readOnly: true }}
                />
              )}
              {sharingState.public && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button
                    variant="outlined"
                    startIcon={<OpenInNewIcon />}
                    component="a"
                    href={sharingState.collectionUri}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open public collection
                  </Button>
                  {sharingState.followersCollectionUri && (
                    <Button
                      variant="outlined"
                      startIcon={<ContentCopyIcon />}
                      onClick={() => copyValue('Followers collection URL', sharingState.followersCollectionUri)}
                    >
                      Copy followers URL
                    </Button>
                  )}
                </Stack>
              )}
            </Stack>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="h6" gutterBottom>
            Manage members
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            This mirrors Bluesky’s list-first flow: add people directly to the list, then review or remove them from one
            place.
          </Typography>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} mb={2}>
            <TextField
              size="small"
              label="Actor or canonical ID"
              value={draft.subject}
              onChange={event => updateDraft(kind, { subject: event.target.value })}
              onKeyDown={event => event.key === 'Enter' && void handleAddSubject(kind)}
              sx={{ flex: 1 }}
              helperText="Examples: @user@example.org, https://example.org/users/alice, did:plc:..."
            />
            <FormControl size="small" sx={{ minWidth: 190 }}>
              <Select
                value={draft.protocol}
                onChange={event => updateDraft(kind, { protocol: event.target.value as SubjectProtocol })}
              >
                {PROTOCOL_OPTIONS.map(option => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              disabled={listState.saving || draft.subject.trim().length === 0}
              onClick={() => void handleAddSubject(kind)}
            >
              {kind === 'mutes' ? 'Mute' : 'Block'}
            </Button>
          </Stack>

          <TextField
            size="small"
            fullWidth
            label={`Search ${meta.title.toLowerCase()}`}
            value={draft.search}
            onChange={event => updateDraft(kind, { search: event.target.value })}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              )
            }}
          />

          {listState.loading && <CircularProgress size={20} sx={{ mt: 2 }} />}

          {listState.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {listState.error}
            </Alert>
          )}

          {listState.loading === false && filteredItems.length === 0 && (
            <Typography variant="body2" color="text.secondary" mt={2}>
              {draft.search.trim().length > 0 ? 'No matching accounts.' : meta.emptyText}
            </Typography>
          )}

          {filteredItems.length > 0 && (
            <List disablePadding sx={{ mt: 2 }}>
              {filteredItems.map(item => (
                <ListItem key={resourceUri(item)} divider sx={{ py: 1.25 }}>
                  <ListItemText
                    primary={
                      <Typography fontFamily="monospace" variant="body2">
                        {item.subjectCanonicalId}
                      </Typography>
                    }
                    secondary={
                      <Stack direction="row" spacing={1} mt={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Chip
                          label={item.subjectProtocol === 'atproto' ? 'ATProto/Bluesky' : 'ActivityPub'}
                          size="small"
                          variant="outlined"
                        />
                      </Stack>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => void handleRemoveSubject(kind, resourceUri(item))}
                      aria-label={kind === 'mutes' ? 'unmute account' : 'unblock account'}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </Paper>

        <Alert severity="info" variant="outlined">
          Need CSV import/export, keyword filters, labelers, or ATProto sync controls? Those stay in{' '}
          <Button
            variant="text"
            size="small"
            startIcon={<SettingsIcon />}
            sx={{ ml: 0.5 }}
            onClick={() => navigate('/settings/moderation/rules')}
          >
            Moderation rules
          </Button>
        </Alert>
      </Stack>
    );
  };

  const activeKind: ListKind = activeTab === 0 ? 'mutes' : 'blocks';
  const dialogKind: ListKind = pendingVisibilityAction?.kind || activeKind;
  const dialogMeta = LIST_META[dialogKind];

  return (
    <Box p={3}>
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', lg: 'flex-start' }}
        mb={2}
      >
        <Box>
          <Typography variant="h5" gutterBottom>
            Moderation Lists
          </Typography>
          <Typography variant="body2" color="text.secondary">
            A Bluesky-style, list-first view for your muted and blocked accounts. These lists are still pod-wide
            settings shared with compatible apps.
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<SettingsIcon />} onClick={() => navigate('/settings/moderation/rules')}>
          Moderation rules
        </Button>
      </Stack>

      {sharingError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {sharingError}
        </Alert>
      )}

      <Paper variant="outlined">
        <Tabs
          value={activeTab}
          onChange={(_, nextValue) => setActiveTab(nextValue)}
          aria-label="Moderation list tabs"
          variant="fullWidth"
        >
          <Tab label="Muted accounts" />
          <Tab label="Blocked accounts" />
        </Tabs>
        <Divider />
        <Box px={2.5} pb={2.5}>
          {renderListPanel(activeKind)}
        </Box>
      </Paper>

      <Dialog
        open={pendingVisibilityAction !== null}
        onClose={() => setPendingVisibilityAction(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {pendingVisibilityAction?.nextPublic
            ? `Make ${dialogMeta.title.toLowerCase()} public?`
            : `Make ${dialogMeta.title.toLowerCase()} private again?`}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">
            {pendingVisibilityAction?.nextPublic
              ? dialogKind === 'blocks'
                ? 'Publishing a block list can reveal sensitive safety choices. Anyone with the ActivityPub URL will be able to inspect it, and compatible servers or apps can follow it.'
                : 'Publishing a mute list will reveal which accounts you have muted and allow compatible servers or apps to follow that list over ActivityPub.'
              : 'Making this list private will stop public sharing. Existing followers may lose access to future updates from the collection.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingVisibilityAction(null)}>Cancel</Button>
          <Button
            variant="contained"
            color={pendingVisibilityAction?.nextPublic && dialogKind === 'blocks' ? 'warning' : 'primary'}
            onClick={() => void confirmVisibilityChange()}
            disabled={sharingSaveTarget !== null}
          >
            {pendingVisibilityAction?.nextPublic ? 'Continue' : 'Make private'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ModerationListsPage;
