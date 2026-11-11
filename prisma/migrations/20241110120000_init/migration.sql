-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "page" TEXT NOT NULL,
    "pageVersion" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "parentId" TEXT,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "quote" TEXT,
    "prefix" TEXT,
    "suffix" TEXT,
    "headingId" TEXT
);

-- CreateIndex
CREATE INDEX "Comment_page_idx" ON "Comment"("page");

-- CreateIndex
CREATE INDEX "Comment_threadId_idx" ON "Comment"("threadId");
