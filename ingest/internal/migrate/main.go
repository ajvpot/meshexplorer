package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/pressly/goose/v3"
)

func main() {
	var (
		host           = flag.String("host", "localhost", "ClickHouse host")
		port           = flag.Int("port", 9000, "ClickHouse port")
		database       = flag.String("database", "default", "ClickHouse database")
		username       = flag.String("username", "default", "ClickHouse username")
		password       = flag.String("password", "", "ClickHouse password")
		migrationsPath = flag.String("path", "migrations", "Path to migration files")
		action         = flag.String("action", "up", "Migration action: up, down, reset, status, version")
		version        = flag.Int("version", 0, "Version for down action")
	)
	flag.Parse()

	// Create ClickHouse connection
	conn := clickhouse.Connector(&clickhouse.Options{
		Addr: []string{fmt.Sprintf("%s:%d", *host, *port)},
		Auth: clickhouse.Auth{
			Database: *database,
			Username: *username,
			Password: *password,
		},
		Settings: clickhouse.Settings{
			"max_execution_time": 60,
		},
		Debug: false,
	})

	// Open database connection
	db := sql.OpenDB(conn)
	defer db.Close()

	// Test connection
	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to connect to ClickHouse: %v", err)
	}

	// Set goose database
	goose.SetBaseFS(os.DirFS(*migrationsPath))

	// Execute migration action
	switch *action {
	case "up":
		if err := goose.Up(db, "."); err != nil {
			log.Fatalf("Failed to run migrations up: %v", err)
		}
		fmt.Println("Migrations applied successfully")
	case "down":
		if *version == 0 {
			// Down one migration
			if err := goose.Down(db, "."); err != nil {
				log.Fatalf("Failed to run migrations down: %v", err)
			}
			fmt.Println("Migration rolled back successfully")
		} else {
			// Down to specific version
			if err := goose.DownTo(db, ".", int64(*version)); err != nil {
				log.Fatalf("Failed to run migrations down to version %d: %v", *version, err)
			}
			fmt.Printf("Migrations rolled back to version %d successfully\n", *version)
		}
	case "reset":
		if err := goose.Reset(db, "."); err != nil {
			log.Fatalf("Failed to reset migrations: %v", err)
		}
		fmt.Println("Migrations reset successfully")
	case "status":
		if err := showStatus(db); err != nil {
			log.Fatalf("Failed to show status: %v", err)
		}
	case "version":
		version, err := goose.GetDBVersion(db)
		if err != nil {
			log.Fatalf("Failed to get migration version: %v", err)
		}
		fmt.Printf("Current migration version: %d\n", version)
	default:
		fmt.Printf("Unknown action: %s\n", *action)
		fmt.Println("Available actions: up, down, reset, status, version")
		os.Exit(1)
	}
}

func showStatus(db *sql.DB) error {
	// Get current version
	currentVersion, err := goose.GetDBVersion(db)
	if err != nil {
		return err
	}

	fmt.Println("Migration Status:")
	fmt.Println("==================")
	fmt.Printf("Current version: %d\n", currentVersion)

	// Note: goose doesn't provide a direct way to list all available migrations
	// from the source, so we can't show pending migrations without additional file system scanning
	fmt.Println("\nNote: Use 'version' action to see current migration state")

	return nil
}
