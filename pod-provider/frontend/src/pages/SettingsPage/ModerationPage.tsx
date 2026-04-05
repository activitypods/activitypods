import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';
import { dashboardApi } from './dashboardApi';

type LdpResource = { '@id': string };

type FilterAction = 'hide' | 'warn' | 'filter';

type KeywordFilter = LdpResource & {
  pattern: string;
  action: FilterAction;
};

type MutedAccount = LdpResource & {
  subjectCanonicalId: string;
  subjectProtocol: string;
};

type BlockedAccount = LdpResource & {
  subjectCanonicalId: string;
  subjectProtocol: string;
};

function useSection<T extends LdpResource>(container: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardApi.list(container);
      setItems(res.data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [container]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (data: Omit<T, '@id'>) => {
    setSaving(true);
    try {
      await dashboardApi.create(container, data);
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (uri: string) => {
    try {
      await dashboardApi.remove(uri);
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
    }
  };

  return { items, loading, saving, error, add, remove };
}

const itemUri = (item: LdpResource) => item['@id'];

const SectionShell = ({
  title,
  count,
  loading,
  error,
  children
}: {
  title: string;
  count: number;
  loading: boolean;
  error: string | null;
  children: React.ReactNode;
}) => (
  <Accordion defaultExpanded={false} disableGutters>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Typography fontWeight={500}>
        {title}
        {loading === false && (
          <Typography component="span" variant="body2" color="text.secondary" ml={1}>
            ({count})
          </Typography>
        )}
      </Typography>
    </AccordionSummary>
    <AccordionDetails>
      {loading && <CircularProgress size={20} />}
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {children}
    </AccordionDetails>
  </Accordion>
);

const ModerationPage = () => {
  const filters = useSection<KeywordFilter>('filters');
  const mutes = useSection<MutedAccount>('mutes');
  const blocks = useSection<BlockedAccount>('blocks');

  const [filterPattern, setFilterPattern] = useState('');
  const [filterAction, setFilterAction] = useState<FilterAction>('hide');
  const [muteSubject, setMuteSubject] = useState('');
  const [blockSubject, setBlockSubject] = useState('');

  const handleAddFilter = async () => {
    if (filterPattern.trim().length === 0) return;
    await filters.add({ pattern: filterPattern.trim(), action: filterAction });
    setFilterPattern('');
    setFilterAction('hide');
  };

  const handleAddMute = async () => {
    if (muteSubject.trim().length === 0) return;
    await mutes.add({ subjectCanonicalId: muteSubject.trim(), subjectProtocol: 'ap' });
    setMuteSubject('');
  };

  const handleAddBlock = async () => {
    if (blockSubject.trim().length === 0) return;
    await blocks.add({ subjectCanonicalId: blockSubject.trim(), subjectProtocol: 'ap' });
    setBlockSubject('');
  };

  return (
    <Box p={3}>
      <Typography variant="h5" gutterBottom>
        Moderation
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        These rules are stored in your Pod and shared with apps that request access.
      </Typography>

      <SectionShell
        title="Keyword Filters"
        count={filters.items.length}
        loading={filters.loading}
        error={filters.error}
      >
        {filters.loading === false && filters.items.length === 0 && (
          <Typography variant="body2" color="text.secondary" mb={1}>
            No keyword filters yet.
          </Typography>
        )}
        <List dense disablePadding>
          {filters.items.map(item => (
            <ListItem key={itemUri(item)} divider>
              <ListItemText
                primary={item.pattern}
                secondary={item.action || 'hide'}
                primaryTypographyProps={{ fontFamily: 'monospace' }}
              />
              <ListItemSecondaryAction>
                <IconButton
                  edge="end"
                  size="small"
                  onClick={() => filters.remove(itemUri(item))}
                  aria-label="delete filter"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
        <Stack direction="row" spacing={1} mt={2} alignItems="center">
          <TextField
            size="small"
            label="Keyword or pattern"
            value={filterPattern}
            onChange={e => setFilterPattern(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddFilter()}
            sx={{ flex: 1 }}
          />
          <Select
            size="small"
            value={filterAction}
            onChange={e => setFilterAction(e.target.value as FilterAction)}
            sx={{ minWidth: 100 }}
          >
            <MenuItem value="hide">Hide</MenuItem>
            <MenuItem value="warn">Warn</MenuItem>
            <MenuItem value="filter">Filter</MenuItem>
          </Select>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            disabled={filterPattern.trim().length === 0 || filters.saving}
            onClick={handleAddFilter}
          >
            Add
          </Button>
        </Stack>
      </SectionShell>

      <SectionShell title="Muted Accounts" count={mutes.items.length} loading={mutes.loading} error={mutes.error}>
        {mutes.loading === false && mutes.items.length === 0 && (
          <Typography variant="body2" color="text.secondary" mb={1}>
            No muted accounts yet.
          </Typography>
        )}
        <List dense disablePadding>
          {mutes.items.map(item => (
            <ListItem key={itemUri(item)} divider>
              <ListItemText primary={item.subjectCanonicalId} secondary={item.subjectProtocol || 'ap'} />
              <ListItemSecondaryAction>
                <IconButton edge="end" size="small" onClick={() => mutes.remove(itemUri(item))} aria-label="unmute">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
        <Stack direction="row" spacing={1} mt={2}>
          <TextField
            size="small"
            label="Actor ID (e.g. @user@instance.social)"
            value={muteSubject}
            onChange={e => setMuteSubject(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddMute()}
            sx={{ flex: 1 }}
          />
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            disabled={muteSubject.trim().length === 0 || mutes.saving}
            onClick={handleAddMute}
          >
            Mute
          </Button>
        </Stack>
      </SectionShell>

      <SectionShell title="Blocked Accounts" count={blocks.items.length} loading={blocks.loading} error={blocks.error}>
        {blocks.loading === false && blocks.items.length === 0 && (
          <Typography variant="body2" color="text.secondary" mb={1}>
            No blocked accounts yet.
          </Typography>
        )}
        <List dense disablePadding>
          {blocks.items.map(item => (
            <ListItem key={itemUri(item)} divider>
              <ListItemText primary={item.subjectCanonicalId} secondary={item.subjectProtocol || 'ap'} />
              <ListItemSecondaryAction>
                <IconButton edge="end" size="small" onClick={() => blocks.remove(itemUri(item))} aria-label="unblock">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
        <Stack direction="row" spacing={1} mt={2}>
          <TextField
            size="small"
            label="Actor ID (e.g. @user@instance.social)"
            value={blockSubject}
            onChange={e => setBlockSubject(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddBlock()}
            sx={{ flex: 1 }}
          />
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            disabled={blockSubject.trim().length === 0 || blocks.saving}
            onClick={handleAddBlock}
          >
            Block
          </Button>
        </Stack>
      </SectionShell>
    </Box>
  );
};

export default ModerationPage;
