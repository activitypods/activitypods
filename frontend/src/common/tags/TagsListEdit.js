// Adopted from https://github.com/marmelab/react-admin/blob/master/examples/crm/src/contacts/TagsListEdit.tsx
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useUpdate, useGetList, useRecordContext, useTranslate, useCreate, LoadingIndicator } from 'react-admin';
import {
  Chip,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Menu,
} from '@mui/material';
import ControlPointIcon from '@mui/icons-material/ControlPoint';
import EditIcon from '@mui/icons-material//Edit';
import { arrayFromLdField, colorFromString } from '../../utils';

const colors = ['lightblue', 'lightgreen', 'lightpink', 'lightyellow', 'lightgrey'];

/**
 * @typedef {import('react').MouseEvent<HTMLDivElement>} ReactDivMouseEvent
 * @typedef {import('react').FormEvent<HTMLFormElement>} ReactFormEvent
 * @typedef {import('react-admin').Identifier} Identifier
 *
 * @typedef {Object} TagsListEditProps
 * @property {string} relationshipPredicate Tag field name that contains the list of resource ids.
 * @property {string} namePredicate Tag field name that contains the tag label to show.
 * @property {string} [colorPredicate] Tag field name that contains the tag color, if present.
 * @property {string} [avatarPredicate] Tag field name that contains the tag avatar URI, if present.
 * @property {string} [tagIdPredicate] Tag field name that contains the tag id, defaults to `id`.
 * @property {string} [recordIdPredicate] Tag field name that contains the record's id, defaults to `id`.
 * @property {string} tagResource The resource name of the tags that can be selected.
 * @property {boolean} [showColors] Whether to show colors (based on tag name), even if the tag doesn't have one, default `true`.
 * @property {boolean} [allowCreate] Whether to allow creating new tags, default `true`.
 *
 */

/**
 * @param {TagsListEditProps} props
 * @returns {JSX.Element | null}
 */
const TagsListEdit = (props) => {
  const {
    relationshipPredicate,
    namePredicate,
    colorPredicate,
    avatarPredicate,
    tagIdPredicate,
    recordIdPredicate,
    tagResource,
    showColors,
    allowCreate,
  } = props;

  // For create new tag dialog.
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(colors[0]);
  const [disabledCreateBtn, setDisabledCreateBtn] = useState(false);

  // Anchor for the tag select menu.
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);

  const translate = useTranslate();

  const record = useRecordContext();
  const recordId = record[recordIdPredicate];

  const [update] = useUpdate();
  const [create] = useCreate();

  const { data: tagData, isLoading: isLoadingAllTags, refetch } = useGetList(tagResource);
  // We maintain a separate state, to display updates immediately.
  const [tagDataState, setTagDataState] = useState(tagData || []);

  // On changes coming from the data provider, we update that state.
  useEffect(() => {
    setTagDataState(tagData);
  }, [setTagDataState, tagData]);

  // All tag ids that which the record has.
  const tagMemberships = useMemo(
    () =>
      tagDataState
        ?.filter((tagObject) => tagObject[relationshipPredicate]?.includes(recordId))
        .map((tagObject) => tagObject[tagIdPredicate]) || [],
    [tagDataState, recordId, relationshipPredicate, tagIdPredicate]
  );

  const setMemberships = useCallback(
    (newTagMemberships) => {
      // First, compute the updated tag states.
      const newTagData = tagDataState.map((tagObject) => {
        const originalTagMemberships = arrayFromLdField(tagObject[relationshipPredicate]);
        const isOriginallyMember = originalTagMemberships.includes(recordId);
        const isNowMember = newTagMemberships.includes(tagObject[tagIdPredicate]);

        if (isOriginallyMember === isNowMember) {
          // Nothing to do.
          return { hasChanged: false, tagObject };
        }

        let newMembers;
        if (isNowMember) {
          newMembers = [...originalTagMemberships, recordId];
        } else {
          newMembers = originalTagMemberships.filter((memberId) => memberId !== recordId);
        }
        return { hasChanged: true, tagObject: { ...tagObject, [relationshipPredicate]: newMembers } };
      });

      // Then, update the local state to show the user immediately.
      setTagDataState(newTagData.map((obj) => obj.tagObject));

      // Persist all tag resources changes where the membership has been modified (added / removed).
      Promise.all(
        newTagData
          .filter((obj) => obj.hasChanged)
          .map((obj) => {
            return update(tagResource, {
              id: obj.tagObject[tagIdPredicate],
              data: obj.tagObject,
            });
          })
      ).then(() => {});
    },
    [recordId, tagDataState, relationshipPredicate, tagIdPredicate, tagResource, update]
  );

  // Convert tagRelationshipData into a common tag format.
  const tags = useMemo(
    () =>
      tagDataState?.map((tagObject) => ({
        id: tagObject[tagIdPredicate],
        name: tagObject[namePredicate],
        // The color or a color generated from the name.
        color: tagObject[colorPredicate] || (showColors && colorFromString(tagObject[namePredicate])),
        avatar: tagObject[avatarPredicate],
        owners: arrayFromLdField(tagObject[relationshipPredicate]),
      })),
    [avatarPredicate, colorPredicate, namePredicate, relationshipPredicate, showColors, tagDataState, tagIdPredicate]
  );

  const selectedTags = useMemo(() => tags?.filter((tag) => tagMemberships.includes(tag.id)), [tags, tagMemberships]);
  const unselectedTags = useMemo(() => tags?.filter((tag) => !tagMemberships.includes(tag.id)), [tags, tagMemberships]);

  /**
   * @param {ReactDivMouseEvent} event
   */
  const handleOpen = (event) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setMenuAnchorEl(null);
  };

  /**
   * @param {Identifier} id
   */
  const handleDeleteTag = (id) => {
    setMemberships(tagMemberships.filter((tagId) => tagId !== id));
  };

  /**
   * @param {Identifier} id
   */
  const handleAddTag = (id) => {
    setMemberships([...tagMemberships, id]);
    setMenuAnchorEl(null);
  };

  const handleOpenCreateDialog = () => {
    setCreateDialogOpen(true);
    setMenuAnchorEl(null);
    setDisabledCreateBtn(false);
  };

  /**
   * @param {ReactFormEvent} event
   */
  const handleCreateTag = (event) => {
    event.preventDefault();
    setDisabledCreateBtn(true);
    create(
      tagResource,
      {
        data: {
          [namePredicate]: newTagName,
          [relationshipPredicate]: [recordId],
          ...((colorPredicate && { [colorPredicate]: newTagColor }) || {}),
        },
      },
      {
        onSuccess: () => {
          setMenuAnchorEl(null);
          setCreateDialogOpen(false);
          refetch();
        },
      }
    );
  };

  return (
    <>
      {isLoadingAllTags && <LoadingIndicator />}
      {selectedTags?.map((tag) => (
        <Chip
          key={tag.id}
          size="small"
          onDelete={() => handleDeleteTag(tag.id)}
          label={tag.name}
          sx={{ backgroundColor: tag.color, border: 0, mr: 1, mb: 1 }}
        />
      ))}
      <Chip
        icon={<ControlPointIcon />}
        size="small"
        onClick={handleOpen}
        label={translate('ra.action.add')}
        color="primary"
        sx={{ border: 0, mr: 1, mb: 1 }}
      />
      <Menu open={Boolean(menuAnchorEl)} onClose={handleClose} anchorEl={menuAnchorEl}>
        {unselectedTags?.map((tag) => (
          <MenuItem key={tag.id} onClick={() => handleAddTag(tag.id)}>
            <Chip
              size="small"
              label={tag.name}
              sx={{
                backgroundColor: tag.color,
                border: 0,
              }}
              onClick={() => handleAddTag(tag.id)}
            />
          </MenuItem>
        ))}
        {allowCreate && (
          <MenuItem onClick={handleOpenCreateDialog}>
            <Chip
              icon={<EditIcon />}
              size="small"
              onClick={handleOpenCreateDialog}
              color="primary"
              label={translate('ra.action.create')}
            />
          </MenuItem>
        )}
      </Menu>
      {allowCreate && (
        <Dialog
          open={isCreateDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
          aria-labelledby="form-dialog-title"
        >
          <form onSubmit={handleCreateTag}>
            <DialogTitle id="form-dialog-title">Create a new tag</DialogTitle>
            <DialogContent>
              <TextField
                autoFocus
                label="Tag name"
                fullWidth
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
                sx={{ mt: 1 }}
              />
              {colorPredicate && (
                <Box display="flex" flexWrap="wrap" width={230} mt={2}>
                  {colors.map((color) => (
                    <RoundButton
                      key={color}
                      color={color}
                      selected={color === newTagColor}
                      handleClick={() => {
                        setNewTagColor(color);
                      }}
                    />
                  ))}
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCreateDialogOpen(false)} color="primary">
                {translate('ra.action.cancel')}
              </Button>
              <Button type="submit" color="primary" disabled={disabledCreateBtn}>
                {translate('ra.action.create')}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      )}
    </>
  );
};

/**
 * @param {RoundButtonProps} props
 * @returns {JSX.Element}
 */
const RoundButton = (props) => (
  <Box
    component="button"
    type="button"
    sx={{
      bgcolor: props.color,
      width: 30,
      height: 30,
      borderRadius: 15,
      border: props.selected ? '2px solid grey' : 'none',
      display: 'inline-block',
      margin: 1,
    }}
    onClick={props.handleClick}
  />
);

TagsListEdit.defaultProps = {
  recordIdPredicate: 'id',
  tagIdPredicate: 'id',
  showColors: true,
  avatarPredicate: undefined,
  colorPredicate: undefined,
  allowCreate: true,
};

export default TagsListEdit;
