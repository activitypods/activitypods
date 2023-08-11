// Adopted from https://github.com/marmelab/react-admin/blob/master/examples/crm/src/contacts/TagsListEdit.tsx
import React, { useEffect, useState } from 'react';
import {
  useUpdate,
  useGetList,
  Identifier,
  useRecordContext,
  useTranslate,
  useCreate,
  LoadingIndicator,
} from 'react-admin';
import { Grid } from '@material-ui/core';

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
} from '@material-ui/core';
import ControlPointIcon from '@material-ui/icons/ControlPoint';
import EditIcon from '@material-ui/icons/Edit';
import { arrayFromLdField, colorFromString } from '../../utils';

const colors = ['lightblue', 'lightgreen', 'lightpink', 'lightyellow', 'lightgrey'];

/**
 * @typedef {import('react').MouseEvent<HTMLDivElement>} ReactDivMouseEvent
 * @typedef {import('react').ChangeEvent<HTMLInputElement>} ReactInputChangeEvent
 * @typedef {import('react').FormEvent<HTMLFormElement>} ReactFormEvent
 * @typedef {object} Tag
 *  @property {Identifier} id
 *  @property {string} name
 *  @property {string} color
 *  @property {string} avatar
 *  @property {Identifier[]} owners
 */

/**
 * @returns {JSX.Element | null}
 */
export const TagsListEdit = (props) => {
  const {
    relationshipPredicate,
    namePredicate,
    colorPredicate,
    avatarPredicate,
    idPredicate,
    tagResource,
    showColors,
    allowCreate,
  } = {
    idPredicate: 'id',
    showColors: true,
    avatarPredicate: undefined,
    colorPredicate: undefined,
    allowCreate: true,
    ...props,
  };

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(colors[0]);
  const [anchorEl, setAnchorEl] = useState(null);
  const [disabled, setDisabled] = useState(false);
  const record = useRecordContext();
  const recordId = record?.id;

  const [cacheInvalidated, setCacheInvalidated] = useState(false);

  const { data: tagData, loading: isLoadingAllTags, refetch, ids } = useGetList(tagResource);
  const [tagRelationshipData, setTagData] = useState(tagData);

  // TODO: Remove this once migrated to ra-4. See https://github.com/marmelab/react-admin/issues/6780
  // Alternatively, maybe try useListController instead...
  useEffect(() => {
    // All of this is super wonky but at least it does not empty the tag list on updates.
    if (!isLoadingAllTags && cacheInvalidated) {
      new Promise((resolve) => setTimeout(resolve, 150)).then(() => {
        setCacheInvalidated(false);
        refetch();
      });
    }
    setTagData(tagData);
  }, [isLoadingAllTags, cacheInvalidated, refetch]);

  const translate = useTranslate();

  const [update] = useUpdate();
  const [create] = useCreate();

  // Convert tagRelationshipData into a common tag format.
  /** @type {Tag[]} */
  const tags = Object.values(tagRelationshipData).map((tagData) => ({
    id: tagData[idPredicate],
    name: tagData[namePredicate],
    // The color or a color generated from the name.
    color: tagData[colorPredicate] || (showColors && colorFromString(tagData[namePredicate])),
    avatar: tagData[avatarPredicate],
    owners: arrayFromLdField(tagData[relationshipPredicate]),
  }));

  const selectedTags = tags.filter((tag) => tag.owners.includes(recordId));
  const unselectedTags = tags.filter((tag) => !tag.owners.includes(recordId));

  /**
   * @param {ReactDivMouseEvent} event
   */
  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  /**
   * @param {Identifier} id
   */
  const handleDeleteTag = (id) => {
    const memberIds = tags.find((tag) => tag.id === id).owners.filter((memberId) => memberId !== recordId);
    update(tagResource, id, {
      ...tagRelationshipData[id],
      [relationshipPredicate]: memberIds,
    });
    setCacheInvalidated(true);
  };

  /**
   * @param {Identifier} id
   */
  const handleAddTag = (id) => {
    const memberIds = [...tags.find((tag) => tag.id === id).owners, recordId];
    update(tagResource, id, {
      ...tagRelationshipData[id],
      [relationshipPredicate]: memberIds,
    });
    setCacheInvalidated(true);
    setAnchorEl(null);
  };

  const handleOpenCreateDialog = () => {
    setCreateDialogOpen(true);
    setAnchorEl(null);
    setDisabled(false);
  };

  /**
   * @param {ReactFormEvent} event
   */
  const handleCreateTag = (event) => {
    event.preventDefault();
    setDisabled(true);
    create(
      tagResource,
      {
        [namePredicate]: newTagName,
        [relationshipPredicate]: [recordId],
        ...((colorPredicate && { [colorPredicate]: newTagColor }) || {}),
      },
      {
        onSuccess: () => {
          setAnchorEl(null);
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
      <Menu open={Boolean(anchorEl)} onClose={handleClose} anchorEl={anchorEl}>
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
        <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} aria-labelledby="form-dialog-title">
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
              <Button type="submit" color="primary" disabled={disabled}>
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
