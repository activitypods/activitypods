import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, List, ListItem, ListItemText, Typography } from '@mui/material';
import { dashboardApi } from './dashboardApi';

type ConsentItem = {
  '@id'?: string;
  id?: string;
  clientId?: string;
  permissions?: string[];
};

const AppPermissionsPage = () => {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consents, setConsents] = useState<ConsentItem[]>([]);

  const loadConsents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardApi.listAppConsents();
      setConsents(res.data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load app consents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConsents();
  }, [loadConsents]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await dashboardApi.createAppConsent({ clientId: 'test-app', permissions: ['read:moderation'] });
      await loadConsents();
    } catch (e: any) {
      setError(e.message || 'Failed to create app consent');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box p={3}>
      <Typography variant="h5" gutterBottom>
        App Permissions
      </Typography>

      <Typography variant="body2" color="text.secondary" gutterBottom>
        Shared moderation and curation access granted to apps.
      </Typography>

      <Box mt={2} mb={2}>
        <Button variant="contained" onClick={handleCreate} disabled={creating || loading}>
          {creating ? 'Creating…' : 'Create test consent'}
        </Button>
      </Box>

      {loading && <CircularProgress />}

      {error && (
        <Box mt={2}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      {!loading && !error && consents.length === 0 && (
        <Box mt={2}>
          <Alert severity="info">No app consent records saved yet.</Alert>
        </Box>
      )}

      {!loading && !error && consents.length > 0 && (
        <List>
          {consents.map((item, index) => (
            <ListItem key={item['@id'] || item.id || index} divider>
              <ListItemText
                primary={item.clientId || 'App consent'}
                secondary={(item.permissions || []).join(', ') || 'No permissions listed'}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
};

export default AppPermissionsPage;
