// Adopted from https://github.com/marmelab/react-admin/blob/master/examples/crm/src/contacts/TagsListEdit.tsx
import React, { useCallback, useEffect, useState } from 'react';
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
  Grid,
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
  const [cacheInvalidated, setCacheInvalidated] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const { data: tagData, ids: tagIds, loading: isLoadingAllTags, refetch } = useGetList(tagResource);
  const [tagDataState, setTagDataState] = useState({});

  const [tagMemberships, setTagMemberships] = useState([]);
  useEffect(() => {
    // TODO: Remove condition, once migrated to ra-4. See https://github.com/marmelab/react-admin/issues/6780
    //  The tagData is emptied on updates because the dataProvider cache is completely invalidated.
    if (tagIds.length > 0) {
      setTagDataState(tagData);
      setTagMemberships(
        Object.values(tagData)
          .filter((tagData) => tagData[relationshipPredicate]?.includes(recordId))
          .map((tagData) => tagData[tagIdPredicate])
      );
    }
  }, [tagDataState, tagData, tagIds, recordId, tagIdPredicate, relationshipPredicate]);

  const saveStateToDataProvider = useCallback(() => {
    if (isUpdating || !cacheInvalidated) return;
    setIsUpdating(true);

    // Update all tag resources where the membership has been modified (added / removed).
    Promise.all(
      Object.values(tagDataState).map((tagObject) => {
        const originalTagMemberships = arrayFromLdField(tagObject[relationshipPredicate]);
        const isOriginallyIncluded = originalTagMemberships.includes(recordId);
        const isNowIncluded = tagMemberships.includes(tagObject[tagIdPredicate]);

        if (isOriginallyIncluded === isNowIncluded) {
          // Nothing to do.
          return Promise.resolve();
        }
        let newMembers;
        if (isNowIncluded) {
          newMembers = [...originalTagMemberships, recordId];
        } else {
          newMembers = originalTagMemberships.filter((memberId) => memberId !== recordId);
        }
        // Set the new members.
        return update(tagResource, tagObject[tagIdPredicate], {
          ...tagObject,
          [relationshipPredicate]: newMembers,
        });
      })
    ).then(() => {
      setCacheInvalidated(false);
      setIsUpdating(false);
    });
  }, [
    isUpdating,
    recordId,
    tagMemberships,
    tagDataState,
    cacheInvalidated,
    relationshipPredicate,
    tagIdPredicate,
    tagResource,
    update,
  ]);

  // On unmount, save the state to the data provider
  useEffect(() => () => saveStateToDataProvider(), [saveStateToDataProvider]);
  // Also save on changes (cacheInvalidated) but only after a while...
  useEffect(() => {
    if (!isLoadingAllTags && cacheInvalidated && !isUpdating) {
      new Promise((resolve) => setTimeout(resolve, 15_000)).then(() => {
        saveStateToDataProvider();
      });
    }
  }, [isLoadingAllTags, cacheInvalidated, isUpdating, saveStateToDataProvider]);

  // Convert tagRelationshipData into a common tag format.
  const tags = Object.values(tagDataState).map((tagData) => ({
    id: tagData[tagIdPredicate],
    name: tagData[namePredicate],
    // The color or a color generated from the name.
    color: tagData[colorPredicate] || (showColors && colorFromString(tagData[namePredicate])),
    avatar: tagData[avatarPredicate],
    owners: arrayFromLdField(tagData[relationshipPredicate]),
  }));

  const selectedTags = tags.filter((tag) => tagMemberships.includes(tag.id));
  const unselectedTags = tags.filter((tag) => !tagMemberships.includes(tag.id));

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
    setTagMemberships(tagMemberships.filter((tagId) => tagId !== id));
    setCacheInvalidated(true);
  };

  /**
   * @param {Identifier} id
   */
  const handleAddTag = (id) => {
    setTagMemberships([...tagMemberships, id]);
    setCacheInvalidated(true);
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
        [namePredicate]: newTagName,
        [relationshipPredicate]: [recordId],
        ...((colorPredicate && { [colorPredicate]: newTagColor }) || {}),
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
      <Grid container spacing={1}>
        {isLoadingAllTags && <LoadingIndicator />}

        {selectedTags.map((tag) => (
          <Grid item mt={1} mb={1} key={tag.id}>
            <Chip
              size="small"
              variant="outlined"
              onDelete={() => handleDeleteTag(tag.id)}
              label={tag.name}
              style={{ backgroundColor: tag.color, border: 0 }}
            />
          </Grid>
        ))}

        <Grid item mt={1} mb={1}>
          <Chip
            icon={<ControlPointIcon />}
            size="small"
            variant="outlined"
            onClick={handleOpen}
            label={translate('ra.action.add')}
            color="secondary"
          />
        </Grid>
      </Grid>
      <Menu open={Boolean(menuAnchorEl)} onClose={handleClose} anchorEl={menuAnchorEl}>
        {unselectedTags?.map((tag) => (
          <MenuItem key={tag.id} onClick={() => handleAddTag(tag.id)}>
            <Chip
              size="small"
              variant="outlined"
              label={tag.name}
              style={{
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
              variant="outlined"
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
