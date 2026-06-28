import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { CategoryComponent } from './pages/category/category.component';
import { ReportComponent } from './pages/report/report.component';
import { NotFoundComponent } from './pages/not-found/not-found.component';

export const routes: Routes = [
	{ path: '', component: HomeComponent },
	{ path: 'category', component: CategoryComponent },
	{ path: 'category/:id', component: CategoryComponent },
	{ path: 'category/:id/:graph', component: CategoryComponent },
	{ path: 'report', component: ReportComponent },
	{ path: '**', component: NotFoundComponent }
];
