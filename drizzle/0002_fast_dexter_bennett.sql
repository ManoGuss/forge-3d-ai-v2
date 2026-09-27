CREATE TABLE `forge_project_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`label` varchar(180) NOT NULL,
	`prompt` text NOT NULL,
	`style` varchar(64) NOT NULL,
	`doodleUrl` text,
	`referencesJson` text,
	`transformJson` text,
	`conceptUrl` text,
	`modelUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forge_project_snapshots_id` PRIMARY KEY(`id`)
);
