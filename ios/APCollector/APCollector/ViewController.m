#import "ViewController.h"
#import "ScreenCaptureManager.h"
#import "CaptureStore.h"

@interface ViewController () <UITableViewDataSource>
@property (nonatomic) UILabel *statusLabel;
@property (nonatomic) UILabel *countLabel;
@property (nonatomic) UITableView *tableView;
@property (nonatomic) NSArray<NSDictionary *> *entries;
@end

@implementation ViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.title = @"AP Collector 1.2";
    self.view.backgroundColor = UIColor.systemBackgroundColor;
    self.navigationController.navigationBar.prefersLargeTitles = YES;

    UILabel *intro = [UILabel new];
    intro.translatesAutoresizingMaskIntoConstraints = NO;
    intro.numberOfLines = 0;
    intro.font = [UIFont systemFontOfSize:15 weight:UIFontWeightMedium];
    intro.text = @"1) Нажмите «Начать сбор».\n2) Выберите «Весь экран».\n3) Откройте AllPredictor.\n4) Нажмите Lucky Jet или Rocket Queen.\n5) Collector сам сохранит ~4 сек ДО перехода и ~3 сек ПОСЛЕ.\n6) Кадры: Файлы → AP Collector → TargetTransitions.";

    self.statusLabel = [UILabel new];
    self.statusLabel.translatesAutoresizingMaskIntoConstraints = NO;
    self.statusLabel.numberOfLines = 0;
    self.statusLabel.font = [UIFont systemFontOfSize:14 weight:UIFontWeightSemibold];
    self.statusLabel.textColor = UIColor.secondaryLabelColor;

    UIButton *start = [UIButton buttonWithType:UIButtonTypeSystem];
    start.translatesAutoresizingMaskIntoConstraints = NO;
    start.configuration = [UIButtonConfiguration filledButtonConfiguration];
    [start setTitle:@"Начать сбор" forState:UIControlStateNormal];
    [start addTarget:self action:@selector(startTapped) forControlEvents:UIControlEventTouchUpInside];

    UIButton *stop = [UIButton buttonWithType:UIButtonTypeSystem];
    stop.translatesAutoresizingMaskIntoConstraints = NO;
    stop.configuration = [UIButtonConfiguration borderedButtonConfiguration];
    [stop setTitle:@"Остановить" forState:UIControlStateNormal];
    [stop addTarget:self action:@selector(stopTapped) forControlEvents:UIControlEventTouchUpInside];

    UIButton *exportJSON = [UIButton buttonWithType:UIButtonTypeSystem];
    exportJSON.translatesAutoresizingMaskIntoConstraints = NO;
    exportJSON.configuration = [UIButtonConfiguration borderedButtonConfiguration];
    [exportJSON setTitle:@"Экспорт JSON" forState:UIControlStateNormal];
    [exportJSON addTarget:self action:@selector(exportJSON) forControlEvents:UIControlEventTouchUpInside];

    UIButton *exportCSV = [UIButton buttonWithType:UIButtonTypeSystem];
    exportCSV.translatesAutoresizingMaskIntoConstraints = NO;
    exportCSV.configuration = [UIButtonConfiguration borderedButtonConfiguration];
    [exportCSV setTitle:@"Экспорт CSV" forState:UIControlStateNormal];
    [exportCSV addTarget:self action:@selector(exportCSV) forControlEvents:UIControlEventTouchUpInside];

    UIButton *clear = [UIButton buttonWithType:UIButtonTypeSystem];
    clear.translatesAutoresizingMaskIntoConstraints = NO;
    [clear setTitle:@"Очистить данные" forState:UIControlStateNormal];
    [clear addTarget:self action:@selector(clearTapped) forControlEvents:UIControlEventTouchUpInside];

    UIStackView *buttons = [[UIStackView alloc] initWithArrangedSubviews:@[start, stop, exportJSON, exportCSV, clear]];
    buttons.axis = UILayoutConstraintAxisVertical;
    buttons.spacing = 8;
    buttons.translatesAutoresizingMaskIntoConstraints = NO;

    self.countLabel = [UILabel new];
    self.countLabel.translatesAutoresizingMaskIntoConstraints = NO;
    self.countLabel.font = [UIFont monospacedDigitSystemFontOfSize:14 weight:UIFontWeightSemibold];

    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStyleInsetGrouped];
    self.tableView.translatesAutoresizingMaskIntoConstraints = NO;
    self.tableView.dataSource = self;

    [self.view addSubview:intro];
    [self.view addSubview:self.statusLabel];
    [self.view addSubview:buttons];
    [self.view addSubview:self.countLabel];
    [self.view addSubview:self.tableView];

    UILayoutGuide *g = self.view.safeAreaLayoutGuide;
    [NSLayoutConstraint activateConstraints:@[
        [intro.topAnchor constraintEqualToAnchor:g.topAnchor constant:10],
        [intro.leadingAnchor constraintEqualToAnchor:g.leadingAnchor constant:16],
        [intro.trailingAnchor constraintEqualToAnchor:g.trailingAnchor constant:-16],
        [self.statusLabel.topAnchor constraintEqualToAnchor:intro.bottomAnchor constant:10],
        [self.statusLabel.leadingAnchor constraintEqualToAnchor:intro.leadingAnchor],
        [self.statusLabel.trailingAnchor constraintEqualToAnchor:intro.trailingAnchor],
        [buttons.topAnchor constraintEqualToAnchor:self.statusLabel.bottomAnchor constant:12],
        [buttons.leadingAnchor constraintEqualToAnchor:intro.leadingAnchor],
        [buttons.trailingAnchor constraintEqualToAnchor:intro.trailingAnchor],
        [self.countLabel.topAnchor constraintEqualToAnchor:buttons.bottomAnchor constant:10],
        [self.countLabel.leadingAnchor constraintEqualToAnchor:intro.leadingAnchor],
        [self.tableView.topAnchor constraintEqualToAnchor:self.countLabel.bottomAnchor constant:4],
        [self.tableView.leadingAnchor constraintEqualToAnchor:g.leadingAnchor],
        [self.tableView.trailingAnchor constraintEqualToAnchor:g.trailingAnchor],
        [self.tableView.bottomAnchor constraintEqualToAnchor:g.bottomAnchor]
    ]];

    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(reloadData) name:APCaptureStoreDidChangeNotification object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(reloadStatus) name:APCaptureStatusNotification object:nil];
    [self reloadData];
    [self reloadStatus];
}

- (void)dealloc { [[NSNotificationCenter defaultCenter] removeObserver:self]; }

- (void)reloadData {
    self.entries = [[CaptureStore shared] entries];
    self.countLabel.text = [NSString stringWithFormat:@"Собрано записей: %lu", (unsigned long)self.entries.count];
    [self.tableView reloadData];
}

- (void)reloadStatus { self.statusLabel.text = [ScreenCaptureManager shared].statusText; }
- (void)startTapped { [[ScreenCaptureManager shared] presentSystemPicker]; }
- (void)stopTapped { [[ScreenCaptureManager shared] stopCapture]; }

- (void)exportURL:(NSURL *)url {
    if (![[NSFileManager defaultManager] fileExistsAtPath:url.path]) return;
    UIActivityViewController *vc = [[UIActivityViewController alloc] initWithActivityItems:@[url] applicationActivities:nil];
    if (vc.popoverPresentationController) vc.popoverPresentationController.sourceView = self.view;
    [self presentViewController:vc animated:YES completion:nil];
}

- (void)exportJSON { [self exportURL:[[CaptureStore shared] jsonURL]]; }
- (void)exportCSV { [self exportURL:[[CaptureStore shared] csvURL]]; }

- (void)clearTapped {
    UIAlertController *a = [UIAlertController alertControllerWithTitle:@"Очистить данные?" message:@"JSON и CSV будут очищены. Папки с кадрами в Files останутся." preferredStyle:UIAlertControllerStyleAlert];
    [a addAction:[UIAlertAction actionWithTitle:@"Отмена" style:UIAlertActionStyleCancel handler:nil]];
    [a addAction:[UIAlertAction actionWithTitle:@"Очистить" style:UIAlertActionStyleDestructive handler:^(UIAlertAction * _Nonnull action) { [[CaptureStore shared] clear]; }]];
    [self presentViewController:a animated:YES completion:nil];
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section { return MIN(self.entries.count, 100); }

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"c"];
    if (!cell) cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleSubtitle reuseIdentifier:@"c"];
    NSUInteger idx = self.entries.count - 1 - indexPath.row;
    NSDictionary *e = self.entries[idx];
    cell.textLabel.text = [NSString stringWithFormat:@"%@  %@", e[@"kind"] ?: @"", e[@"value"] ?: @""];
    cell.textLabel.numberOfLines = 2;
    cell.detailTextLabel.text = e[@"timestamp"] ?: @"";
    return cell;
}

@end
