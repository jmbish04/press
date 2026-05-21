/**
 * Multi-select component for tags with color support
 */

import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils";
import { Badge } from "./badge";
import { Button } from "./button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface Tag {
  id: number;
  name: string;
  hexColor: string;
  definition?: string | null;
}

interface TagMultiSelectProps {
  tags: Tag[];
  selectedTagIds: number[];
  onSelectedTagsChange: (tagIds: number[]) => void;
  onCreateTag?: (name: string) => void;
}

export function TagMultiSelect({
  tags,
  selectedTagIds,
  onSelectedTagsChange,
  onCreateTag,
}: TagMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");

  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id));
  const availableTags = tags.filter((tag) => !selectedTagIds.includes(tag.id));

  const handleToggle = (tagId: number) => {
    const newSelection = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    onSelectedTagsChange(newSelection);
  };

  const handleRemove = (tagId: number) => {
    onSelectedTagsChange(selectedTagIds.filter((id) => id !== tagId));
  };

  const handleCreate = () => {
    if (searchValue.trim() && onCreateTag) {
      onCreateTag(searchValue.trim());
      setSearchValue("");
    }
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between rounded-none uppercase tracking-wider text-xs"
          >
            {selectedTags.length > 0
              ? `${selectedTags.length} tag${selectedTags.length > 1 ? "s" : ""} selected`
              : "Select tags..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0 rounded-none" align="start">
          <Command>
            <CommandInput
              placeholder="Search or create tag..."
              value={searchValue}
              onValueChange={setSearchValue}
              className="rounded-none"
            />
            <CommandEmpty>
              {onCreateTag && searchValue.trim() ? (
                <button
                  className="flex w-full items-center gap-2 px-2 py-3 hover:bg-accent"
                  onClick={handleCreate}
                >
                  <Plus className="h-4 w-4" />
                  <span className="uppercase text-xs tracking-wider">
                    Create "{searchValue.trim()}"
                  </span>
                </button>
              ) : (
                <span className="text-muted-foreground text-xs">No tags found</span>
              )}
            </CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {availableTags.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={tag.name}
                  onSelect={() => handleToggle(tag.id)}
                  className="flex items-center gap-2 cursor-pointer rounded-none"
                >
                  <Check
                    className={cn(
                      "h-4 w-4",
                      selectedTagIds.includes(tag.id) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.hexColor }} />
                  <span className="uppercase text-xs tracking-wider">{tag.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <Badge
              key={tag.id}
              className="rounded-none uppercase text-xs tracking-wider"
              style={{ backgroundColor: tag.hexColor, color: "#ffffff" }}
            >
              {tag.name}
              <button
                onClick={() => handleRemove(tag.id)}
                className="ml-2 hover:opacity-70"
                aria-label={`Remove ${tag.name} tag`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
