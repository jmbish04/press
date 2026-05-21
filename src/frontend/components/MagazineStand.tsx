/**
 * Magazine Stand - displays articles in a grid with animations
 */

import { ExternalLink, Tag as TagIcon } from "lucide-react";
import React, { useEffect, useState } from "react";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { TagMultiSelect, type Tag } from "./ui/tag-multi-select";

interface Article {
  id: number;
  url: string;
  rawContent: string | null;
  screenshotUrl: string | null;
  createdAt: number;
  tags: Tag[];
  properties: Record<string, string>;
}

interface MagazineStandProps {
  onArticleSelect?: (article: Article) => void;
}

export function MagazineStand({ onArticleSelect }: MagazineStandProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<"none" | "tag" | "topic">("none");

  useEffect(() => {
    loadArticles();
    loadTags();
  }, [selectedTagIds]);

  const loadArticles = async () => {
    setLoading(true);
    try {
      const tagQuery = selectedTagIds.length > 0 ? `?tagIds=${selectedTagIds.join(",")}` : "";
      const response = await fetch(`/api/articles${tagQuery}`);
      const data = await response.json();
      setArticles(data.articles || []);
    } catch (error) {
      console.error("Failed to load articles:", error);
    }
    setLoading(false);
  };

  const loadTags = async () => {
    try {
      const response = await fetch("/api/tags");
      const data = await response.json();
      setAllTags(data.tags || []);
    } catch (error) {
      console.error("Failed to load tags:", error);
    }
  };

  const handleCreateTag = async (name: string) => {
    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const newTag = await response.json();
      setAllTags([...allTags, newTag]);
    } catch (error) {
      console.error("Failed to create tag:", error);
    }
  };

  const groupedArticles = React.useMemo(() => {
    if (groupBy === "none") {
      return { Ungrouped: articles };
    }

    if (groupBy === "tag") {
      const grouped: Record<string, Article[]> = {};
      articles.forEach((article) => {
        if (article.tags.length === 0) {
          if (!grouped["Untagged"]) grouped["Untagged"] = [];
          grouped["Untagged"].push(article);
        } else {
          article.tags.forEach((tag) => {
            if (!grouped[tag.name]) grouped[tag.name] = [];
            grouped[tag.name].push(article);
          });
        }
      });
      return grouped;
    }

    if (groupBy === "topic") {
      const grouped: Record<string, Article[]> = {};
      articles.forEach((article) => {
        const topic = article.properties.topic || "Uncategorized";
        if (!grouped[topic]) grouped[topic] = [];
        grouped[topic].push(article);
      });
      return grouped;
    }

    return { Ungrouped: articles };
  }, [articles, groupBy]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between border-b border-border pb-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold uppercase tracking-widest">The Magazine Stand</h2>
          <p className="text-muted-foreground text-xs uppercase tracking-wider">
            {articles.length} article{articles.length !== 1 ? "s" : ""} archived
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="w-full sm:w-64">
            <TagMultiSelect
              tags={allTags}
              selectedTagIds={selectedTagIds}
              onSelectedTagsChange={setSelectedTagIds}
              onCreateTag={handleCreateTag}
            />
          </div>

          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
            className="px-4 py-2 border border-input bg-background text-foreground rounded-none uppercase text-xs tracking-wider hover:bg-accent"
          >
            <option value="none">No Grouping</option>
            <option value="tag">Group by Tag</option>
            <option value="topic">Group by Topic</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground uppercase tracking-wider text-sm">
          Loading articles...
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="uppercase tracking-wider text-sm">No articles found</p>
          <p className="text-xs mt-2">Start by ingesting some URLs</p>
        </div>
      ) : (
        <div className="space-y-12">
          {Object.entries(groupedArticles).map(([groupName, groupArticles]) => (
            <div key={groupName} className="space-y-6">
              {groupBy !== "none" && (
                <h3 className="text-xl font-bold uppercase tracking-widest border-l-4 border-primary pl-4">
                  {groupName}
                </h3>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupArticles.map((article, idx) => (
                  <Card
                    key={article.id}
                    className="group overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 rounded-none border-2 hover:border-primary animate-fade-in"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    {article.screenshotUrl && (
                      <div className="relative h-48 overflow-hidden bg-muted">
                        <img
                          src={article.screenshotUrl}
                          alt={article.properties.title || "Article screenshot"}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      </div>
                    )}

                    <div className="p-4 space-y-3">
                      <div className="space-y-1">
                        <h4 className="font-bold text-base uppercase tracking-wide line-clamp-2 group-hover:text-primary transition-colors">
                          {article.properties.title || "Untitled Article"}
                        </h4>
                        {article.properties.author && (
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">
                            By {article.properties.author}
                          </p>
                        )}
                      </div>

                      {article.properties.summary && (
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {article.properties.summary}
                        </p>
                      )}

                      {article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {article.tags.map((tag) => (
                            <Badge
                              key={tag.id}
                              className="rounded-none text-[10px] px-1 py-0"
                              style={{ backgroundColor: tag.hexColor, color: "#ffffff" }}
                            >
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-none uppercase text-xs tracking-wider"
                          onClick={() => window.open(article.url, "_blank")}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Visit
                        </Button>
                        {onArticleSelect && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 rounded-none uppercase text-xs tracking-wider"
                            onClick={() => onArticleSelect(article)}
                          >
                            <TagIcon className="h-3 w-3 mr-1" />
                            Edit Tags
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
