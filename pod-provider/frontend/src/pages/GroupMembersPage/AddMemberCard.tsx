import React, { useMemo, useState } from 'react';
import { useTranslate, useNotify, useGetList } from 'react-admin';
import { Box, Card, Typography, Button, Autocomplete, TextField } from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useWebfinger } from '@semapps/activitypub-components';
import { formatUsername } from '../../utils';
import { GroupMember } from '../../hooks/useGroupMembers';

type Props = {
  members?: GroupMember[];
  onAdd: (memberUri: string) => Promise<void>;
};

const AddMemberCard = ({ members, onAdd }: Props) => {
  const translate = useTranslate();
  const notify = useNotify();
  const webfinger = useWebfinger();
  const [value, setValue] = useState<any>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { data: profiles } = useGetList('Profile', {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: 'vcard:given-name', order: 'ASC' }
  });

  const options = useMemo(
    () =>
      (profiles || []).filter(
        profile => profile.describes && !members?.some(member => member.webId === profile.describes)
      ),
    [profiles, members]
  );

  const submit = async () => {
    const id = value?.describes || inputValue.trim();
    if (!id) return;
    setIsSaving(true);
    try {
      const memberUri = id.startsWith('http') ? id : await webfinger.fetch(id);
      if (!memberUri) {
        notify('app.notification.user_not_found', { type: 'error', messageArgs: { username: id } });
      } else {
        await onAdd(memberUri);
        notify('app.notification.member_added', { type: 'success' });
        setValue(null);
        setInputValue('');
      }
    } catch (e: any) {
      notify(e.message, { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card sx={{ mt: '5px', mb: 3 }}>
      <Box p={2} sx={{ backgroundColor: 'primary.main', color: 'primary.contrastText' }}>
        <Typography variant="h6">{translate('app.card.add_member')}</Typography>
      </Box>
      <Box p={2}>
        <Typography variant="body2" mb={2}>
          {translate('app.helper.add_member')}
        </Typography>
        <Autocomplete
          freeSolo
          options={options}
          value={value}
          onChange={(_, newValue) => setValue(typeof newValue === 'string' ? null : newValue)}
          inputValue={inputValue}
          onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
          getOptionLabel={option => (typeof option === 'string' ? option : formatUsername(option.describes))}
          renderOption={({ key, ...props }, option) => (
            <li key={key} {...props}>
              {option['vcard:given-name']} ({formatUsername(option.describes)})
            </li>
          )}
          renderInput={params => (
            <TextField
              {...params}
              label={translate('app.input.user_id')}
              placeholder={translate('app.placeholder.user_id')}
            />
          )}
        />
        <Box mt={2} display="flex" justifyContent="center">
          <Button
            variant="contained"
            color="secondary"
            startIcon={<PersonAddIcon />}
            onClick={submit}
            disabled={isSaving || (!value && !inputValue.trim())}
          >
            {translate('app.action.add_member')}
          </Button>
        </Box>
      </Box>
    </Card>
  );
};

export default AddMemberCard;
