import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, List, ListItem, ListItemText, Typography } from '@mui/material';
import { dashboardApi } from './dashboardApi';

type PreferenceItem = {
  '@id'?: string;
  id?: string;
  category?: string;
  value?: any;
  pattern?: string;
  action?: string;
};

const renderValue = (item: PreferenceItem) => {
  if (item.pattern) return `${item.pattern}${item.action ? ` → ${item.action}` : ''}`;
  if (item.category) return `${item.category}: ${JSON.stringify(item.value ?? null)}`;
  return JSON.stringify(item);
};

const ModerationPage = () => {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<PreferenceItem[]>([]);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardApi.list('preferences');
      setPreferences(res.data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load moderation preferences');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await dashboardApi.create('preferences', { category: 'ui', value: { theme: 'dark' } });
      await loadPreferences();
    } catch (e: any) {
      setError(e.message || 'Failed to create preference');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box p={3}>
      <Typography variant="h5" gutterBottom>
        Moderation Preferences
      </Typography>

      <Typography variant="body2" color="text.secondary" gutterBottom>
        These settings are stored in your Pod and can be reused across apps.
      </Typography>

      <Box mt={2} mb={2}>
        <Button variant="contained" onClick={handleCreate} disabled={creating || loading}>
          {creating ? 'Creating…' : 'Create test preference'}
        </Button>
      </Box>

      {loading && <CircularProgress />}

      {error && (
        <Box mt={2}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      {!loading && !error && preferences.length === 0 && (
        <Box mt={2}>
          <Alert severity="info">No moderation preferences saved yet.</Alert>
        </Box>
      )}

      {!loading && !error && preferences.length > 0 && (
        <List>
          {preferences.map((item, index) => (
            <ListItem key={item['@id'] || item.id || index} divider>
              <ListItemText
                primary={item.category || item.pattern || 'Preference'}
                secondary={renderValue(item)}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
};

export default ModerationPage;
