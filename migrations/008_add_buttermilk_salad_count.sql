-- Add buttermilk_count and salad_count columns to meals table
ALTER TABLE meals ADD COLUMN buttermilk_count INT NULL DEFAULT NULL;
ALTER TABLE meals ADD COLUMN salad_count INT NULL DEFAULT NULL;
