CREATE TABLE `forge_generations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int,
	`prompt` text NOT NULL,
	`style` varchar(64) NOT NULL,
	`status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
	`conceptUrl` text,
	`modelUrl` text,
	`provider` varchar(80),
	`error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forge_generations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `forge_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`name` varchar(180) NOT NULL,
	`slug` varchar(220) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `forge_projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `forge_references` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int,
	`generationId` int,
	`type` varchar(40) NOT NULL,
	`label` varchar(180),
	`url` text NOT NULL,
	`mimeType` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forge_references_id` PRIMARY KEY(`id`)
);
